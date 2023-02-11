import { Context, Schema, Session, Element, h, $ } from 'koishi'

declare module 'koishi' {
  interface Tables {
    at_record: AtRecord
  }
  interface Channel {
    atSubscribers: string[]
  }
}

export interface AtRecord {
  id: number
  quoteMessageId: string
  targetId: string
  senderId: string
  nickname: string
  guildName: string
  content: string
  time: Date
}

export const name = 'subscribe-at'
export interface Config {
  atDeduplication: boolean
  deleteBeforeGet: boolean
}

export const Config: Schema<Config> = Schema.object({
  atDeduplication: Schema.boolean().default(true).description('@去重，如果关闭，在被回复的时候有可能出现两个@。'),
  deleteBeforeGet: Schema.boolean().default(true).description('是否在阅读后删除数据库中的消息记录。'),
})

export const using = ['database'] as const

function dedupe<T = any>(arr: T[], primary: (item: T) => string | number | symbol): T[] {
  return Object.values(arr.reduce((p, c) => ({...p, [primary(c)]: c}), {}))
}

async function transformAt(elements: Element[], session: Session): Promise<Element[]> {
  return Promise.all(elements.map(async e => {
    if (e.type !== 'at') return e
    const target = await session.bot.getGuildMember(session.guildId, e.attrs.id)
    return h.text(`@${target.nickname || target.username || target.userId}`)
  }))
}

export function apply(ctx: Context, config: Config) { 
  ctx.i18n.define('zh', require('./locales/zh-CN'))

  ctx.model.extend('at_record', {
    id: 'unsigned',
    targetId: 'string',
    senderId: 'string',
    nickname: 'string',
    guildName: 'string',
    content: 'text',
    time: 'timestamp',
    quoteMessageId: 'string',
  }, {
    autoInc: true,
  })

  ctx.model.extend('channel', {
    atSubscribers: 'list',
  })

  ctx.guild().middleware(async (session, next) => {
    const contentElements = config.atDeduplication ? dedupe(session.elements, elem => elem.attrs.id ?? Math.random()) : session.elements
    const { atSubscribers } = await ctx.database.getChannel(session.platform, session.channelId)
    const atElements = contentElements.filter(elem => elem.type === 'at' && atSubscribers.includes(elem.attrs.id))
    if (atElements.length < 1) return next()
    // `Promise.all()` here makes all asynchronous functions running concurrently.
    const [{ guildName }, sender, content] = await Promise.all([
      session.bot.getGuild(session.guildId),
      session.bot.getGuildMember(session.guildId, session.userId),
      transformAt(contentElements, session),
    ])
    const time = new Date(session.timestamp)

    await ctx.database.upsert('at_record', atElements.map(e => ({
      nickname: sender.nickname || sender.username || sender.userId,
      quoteMessageId: session.quote?.messageId,
      senderId: session.userId,
      targetId: e.attrs.id,
      content: content.join(''),
      guildName,
      time,
    })))
    return next()
  })

  ctx.command('at.get')
  .shortcut('at.get', { i18n: true, fuzzy: true })
  .option('count', '-n <count:number>', { fallback: 100, descPath: 'commands.at.get.options.count' })
  .option('all', '-a', { descPath: 'commands.at.get.options.all' })
  .option('reverse', '-r', { descPath: 'commands.at.get.options.reverse' })
  .example('<i18n path="commands.at.get.shortcuts.at.get"/> -r')
  .action(async ({ session, options }) => {
    const [ totalCount, { atSubscribers }] = await Promise.all([
      ctx.database.select('at_record').where({ targetId: session.userId }).execute(r => $.count(r.id)),
      ctx.database.getChannel(session.platform, session.guildId),
    ])

    if (!atSubscribers.includes(session.userId) && totalCount < 1) return session.transform(h.parse(session.text('.no-subscription')))
    if (totalCount < 1) return session.text('.empty')

    const messages = await ctx.database.get('at_record', { targetId: session.userId }, 
    { limit: options.all ? totalCount : Math.min(options.count, totalCount), sort: { id: options.reverse ? 'desc' : 'asc' }})

    for (let o = 0; o < messages.length; o += 100) {
      await session.sendQueued(<message forward>
        {messages.slice(o, o + 100).map(e => <>
          <message userId={e.senderId} nickname={session.text('.guild', [e.guildName]) + e.nickname} time={e.time.getTime()}>
            {e.quoteMessageId && <quote id={e.quoteMessageId}/>}
            {h.parse(e.content)}
          </message>
        </>)}
      </message>)
    }
    
    if (config.deleteBeforeGet) await ctx.database.remove('at_record', messages.map(m => m.id))
  })

  ctx.command('at.subscribe')
  .channelFields(['atSubscribers'])
  .shortcut('at.subscribe', { i18n: true })
  .action(({ session }) => {
    if (session.channel.atSubscribers.includes(session.userId)) return session.text('.exist')
    session.channel.atSubscribers.push(session.userId)
    return session.text('.success')
  })

  ctx.command('at.unsubscribe')
  .shortcut('at.unsubscribe', { i18n: true })
  .channelFields(['atSubscribers'])
  .action(({ session }) => {
    const sub = session.channel.atSubscribers
    const index = sub.indexOf(session.userId)
    if (index < 0) return session.text('.none')
    sub.splice(index, 1)
    return session.text('.success')
  })
}
