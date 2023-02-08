import { Context, Schema, Session, Element, h } from 'koishi'

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
  guildId: string
  guildName: string
  content: string
  time: Date
}

export const name = 'subscribe-at'
export interface Config {
  atDeduplication: boolean
}

export const Config: Schema<Config> = Schema.object({
  atDeduplication: Schema.boolean().default(true).description('@去重，如果关闭，在被回复的时候有可能出现两个@。')
})

export const using = ['database'] as const

function dedupe<T = any>(arr: T[], primary: (item: T) => string | number | symbol): T[] {
  return Object.values(arr.reduce((p, c) => ({...p, [primary(c)]: c}), {}))
}

async function transformAt(elements: Element[], session: Session): Promise<Element[]> {
  return Promise.all(elements.map(async e => {
    if (e.type === 'at') {
      const target = await session.bot.getGuildMember(session.guildId, e.attrs.id)
      return h.text(`@${target.nickname || target.username || target.userId} `)
    }
    return e
  }))
}

export function apply(ctx: Context, config: Config) { 
  ctx.i18n.define('zh', require('./locales/zh-CN'))

  ctx.model.extend('at_record', {
    id: 'unsigned',
    targetId: 'string',
    senderId: 'string',
    nickname: 'string',
    guildId: 'string',
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
    const { atSubscribers } = await ctx.database.getChannel(session.platform, session.channelId)
    const atElements = contentElements.filter(elem =>  elem.type === 'at' && atSubscribers.includes(elem.attrs.id))
    const sender = await session.bot.getGuildMember(session.guildId, session.userId)
    const guild = await session.bot.getGuild(session.guildId)

    atElements.forEach(async (value) => ctx.database.create('at_record', {
      time: new Date(session.timestamp),
      targetId: value.attrs.id,
      senderId: session.userId,
      nickname: sender.nickname || sender.username || sender.userId,
      guildId: session.guildId,
      guildName: guild.guildName,
      content: contentElements.map(i => i.toString()).join(''),
    }))
  })

  ctx.command('at.get').action(async ({ session }) => {
    const atMessages = await ctx.database.get('at_record', { targetId: { $eq: session.userId }})
    
    for (let i = 0; i < atMessages.length; i += 100) {
      session.send(<message forward>
        {await Promise.all(atMessages.slice(i, i + 100).map(async e => <message>
          <author userId={e.senderId} nickname={e.nickname}/>
          <i18n path=".guild">{[e.guildName ?? e.guildId]}</i18n>
          {await transformAt(h.parse(e.content), session)}
        </message>))}
      </message>)
    }
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
