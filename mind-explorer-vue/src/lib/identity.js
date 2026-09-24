/**
 * 身份规则 —— 唯一真源（批次 M1）
 *
 * 这里是唯一写着「账号对象 → user_identifier」这条规则的地方。
 * 收敛前它被抄了三份（Companion.vue / useChat.js / XiaomuPet.vue），
 * 而 user_identifier 是服务端记忆的归属键 —— 三处不一致 = 记忆串号。
 *
 * 纯函数、零依赖：store、composable、组件都能直接用，也便于离线断言。
 * 后端对应的白名单在 supabase/functions/_shared/auth.js（RE_GITHUB_UID / RE_GUEST_UID / RE_QUICK_UID）。
 *
 *   null                              → kind 'none'   uid ''
 *   { type:'github', username:'abc' } → kind 'github' uid 'gh:abc'
 *   { type:'guest',  id:'<uuid>' }    → kind 'guest'  uid 'g:<uuid>'      正式游客（有密码）
 *   { type:'guest',  id:'g_xxx' }     → kind 'quick'  uid 'g:g_xxx'       本机快速游客（无密码）
 */

/** 账号对象 → user_identifier（后端记忆归属键） */
export function identifierOf(account) {
  if (!account) return ''
  if (account.type === 'github') return account.username ? `gh:${account.username}` : ''
  if (account.id === undefined || account.id === null || account.id === '') return ''
  return `g:${account.id}`
}

/** 账号对象 → 身份种类（none / github / guest / quick） */
export function kindOf(account) {
  if (!account) return 'none'
  if (account.type === 'github') return 'github'
  // 正式游客的 id 由数据库生成（UUID）；快速游客是本机生成的 g_ + base36
  return /^g_/.test(String(account.id ?? '')) ? 'quick' : 'guest'
}

/** 仅快速游客（无密码、不可跨设备）需要走升级路径 */
export function isQuickGuest(account) {
  return kindOf(account) === 'quick'
}
