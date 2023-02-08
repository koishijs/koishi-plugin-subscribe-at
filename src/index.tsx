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
    return h.text(`@${target.nickname || target.username || target.userId} `)
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
  }, {
    autoInc: true,
  })

  ctx.model.extend('channel', {
    atSubscribers: 'list',
  })

  ctx.guild().middleware(async (session: Session) => {
    const contentElements = config.atDeduplication ? dedupe(session.elements, elem => elem.attrs.id ?? Math.random()) : session.elements
    // `Promise.all()` here makes all asynchronous functions running concurrently.
    const [{ atSubscribers }, { guildName }, sender, content] = await Promise.all([
      ctx.database.getChannel(session.platform, session.channelId),
      session.bot.getGuild(session.guildId),
      session.bot.getGuildMember(session.guildId, session.userId),
      transformAt(session.elements, session),
    ])
    const atElements = contentElements.filter(elem => elem.type === 'at' && atSubscribers.includes(elem.attrs.id))
    const time = new Date(session.timestamp)

    atElements.forEach((value) => ctx.database.create('at_record', {
      targetId: value.attrs.id,
      senderId: session.userId,
      nickname: sender.nickname || sender.username || sender.userId,
      content: content.join(''),
      guildName,
      time,
    }))
  })

  ctx.command('at.get')
  .option('count', '-n <count:number>', { fallback: 10 })
  .option('all', '-a')
  .action(async ({ session, options }) => {
    const totalCount = await ctx.database.select('at_record').where({ targetId: session.userId }).execute(r => $.count(r.id))

    if (totalCount < 1) return session.text('.empty')

    const messages = await ctx.database.get('at_record', { targetId: session.userId }, { limit: options.all ? totalCount : Math.min(options.count, totalCount) })

    for (let o = 0; o < messages.length; o += 100) {
      await session.sendQueued(<message forward>
        {messages.slice(o, o + 100).map(e => <>
          <message>
            <author userId={e.senderId} nickname={e.nickname}/>
            <i18n path=".guild">{[e.guildName]}</i18n>
            {h.parse(e.content)}
          </message>
        </>)}
      </message>)
    }
    
    if (config.deleteBeforeGet) await ctx.database.remove('at_record', messages.map(m => m.id))
  })

  ctx.command('at.subscribe').channelFields(['atSubscribers']).action(({ session }) => {
    if (session.channel.atSubscribers.includes(session.userId)) return session.text('.exist')
    session.channel.atSubscribers.push(session.userId)
    return session.text('.success')
  })

  ctx.command('at.unsubscribe').channelFields(['atSubscribers']).action(({ session }) => {
    const sub = session.channel.atSubscribers
    if (!sub.includes(session.userId)) return session.text('.none')
    sub.splice(sub.findIndex(u => u === session.userId), 1)
    return session.text('.success')
  })
}
