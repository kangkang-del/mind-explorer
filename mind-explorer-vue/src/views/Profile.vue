<template>
  <main class="max-w-3xl mx-auto px-4 py-6">
    <header class="mb-5">
      <h1 class="text-2xl font-bold text-[#3a4a5c] m-0">👤 个人中心</h1>
    </header>

    <!-- 用户信息卡 -->
    <section class="flex flex-col md:flex-row gap-4 items-center p-5 bg-white border border-[#eef2f7] rounded-2xl mb-5">
      <div class="w-16 h-16 rounded-full bg-gradient-to-br from-[#7c9cb8] to-[#a8c3d6] text-white flex items-center justify-center text-[15px] shrink-0">
        {{ avatarText }}
      </div>
      <div class="text-center md:text-left flex-1">
        <h2 class="text-lg font-bold text-[#3a4a5c] m-0">{{ displayName }}</h2>
        <p class="text-[13px] text-[#9aa6b2] my-1 m-0">
          <span v-if="auth.currentUser && auth.currentUser.type === 'github'">🐙 GitHub 登录</span>
          <span v-else-if="auth.currentUser">🏠 游客用户</span>
          <span v-else>登录后可同步收藏、对话记录与反馈</span>
        </p>
        <button
          v-if="!auth.currentUser"
          @click="auth.login()"
          class="px-4 py-1.5 bg-[#7c9cb8] text-white border-0 rounded-md text-[13px] cursor-pointer hover:opacity-90"
        >
          登录 / 注册
        </button>
        <button
          v-else
          @click="auth.logout()"
          class="px-4 py-1.5 text-[13px] text-[#9aa6b2] border border-[#e0e6ec] rounded-md hover:bg-[#f0f4f9] transition"
        >
          退出登录
        </button>
      </div>
    </section>

    <!-- 进度卡片 -->
    <section v-if="auth.currentUser" class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      <div class="bg-white rounded-2xl border border-[#eef2f7] p-4 text-center">
        <p class="text-[28px] font-bold text-[#e07a3f] m-0">🔥</p>
        <p class="text-[12px] text-[#9aa6b2] mt-1 m-0">连续打卡</p>
        <p class="text-[20px] font-bold text-[#3a4a5c] m-0">{{ checkinStats.streak }} 天</p>
      </div>
      <div class="bg-white rounded-2xl border border-[#eef2f7] p-4 text-center">
        <p class="text-[28px] font-bold text-[#7c9cb8] m-0">📅</p>
        <p class="text-[12px] text-[#9aa6b2] mt-1 m-0">累计打卡</p>
        <p class="text-[20px] font-bold text-[#3a4a5c] m-0">{{ checkinStats.total }} 天</p>
      </div>
      <div class="bg-white rounded-2xl border border-[#eef2f7] p-4 text-center">
        <p class="text-[28px] font-bold text-[#e07a3f] m-0">♥</p>
        <p class="text-[12px] text-[#9aa6b2] mt-1 m-0">我的收藏</p>
        <p class="text-[20px] font-bold text-[#3a4a5c] m-0">{{ favorites.length }}</p>
      </div>
      <div class="bg-white rounded-2xl border border-[#eef2f7] p-4 text-center">
        <RouterLink to="/upload" class="no-underline">
          <p class="text-[28px] font-bold text-[#7c9cb8] m-0">🌱</p>
          <p class="text-[12px] text-[#9aa6b2] mt-1 m-0">我的投稿</p>
          <p class="text-[20px] font-bold text-[#3a4a5c] m-0">写一条</p>
        </RouterLink>
      </div>
    </section>

    <!-- 我的成就 -->
    <section v-if="auth.currentUser" class="bg-white rounded-2xl border border-[#eef2f7] p-5 mb-5">
      <h2 class="text-[16px] font-bold text-[#3a4a5c] mb-3 m-0">🏅 我的成就</h2>
      <BadgeWall :badges="badgesStore.badges" />
    </section>

    <!-- 信任联系人 -->
    <section v-if="auth.currentUser" class="bg-white rounded-2xl border border-[#eef2f7] p-5 mb-5">
      <h2 class="text-[16px] font-bold text-[#3a4a5c] mb-1.5 m-0">🛡️ 信任联系人</h2>
      <p class="text-[13px] text-[#9aa6b2] m-0 mb-4 leading-relaxed">
        遇到难熬的时刻，可以找这些重要的人聊聊。信息只保存在你的设备上，不会上传到服务器。
      </p>

      <ul v-if="trusted.count" class="space-y-2 mb-4">
        <li
          v-for="c in trusted.contacts"
          :key="c.id"
          class="flex items-center gap-3 py-2.5 px-3 bg-[#f7fafc] border border-[#eef2f7] rounded-xl"
        >
          <div class="flex-1 min-w-0">
            <p class="text-[14px] text-[#3a4a5c] font-semibold m-0 truncate">
              {{ c.name }}<span v-if="c.relation" class="text-[12px] text-[#9aa6b2] font-normal ml-2">{{ c.relation }}</span>
            </p>
            <p v-if="c.phone" class="text-[13px] text-[#7c9cb8] m-0">{{ c.phone }}</p>
          </div>
          <button
            @click="trusted.remove(c.id)"
            class="text-[12px] text-[#c98a8a] border border-[#f0dcdc] rounded-md px-2.5 py-1 hover:bg-[#fdeeee] transition shrink-0"
          >
            删除
          </button>
        </li>
      </ul>
      <p v-else class="text-[13px] text-[#9aa6b2] py-2 m-0 mb-4">还没有添加信任联系人，下面加一位吧～</p>

      <form @submit.prevent="addContact" class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
        <div class="sm:col-span-4">
          <label class="block text-[12px] text-[#9aa6b2] mb-1">称呼 *</label>
          <input
            v-model="tcForm.name"
            maxlength="20"
            placeholder="如：妈妈 / 阿琳"
            class="w-full px-2.5 py-1.5 border border-[#e0e6ec] rounded-lg text-[14px] focus:outline-none focus:border-[#7c9cb8]"
          />
        </div>
        <div class="sm:col-span-4">
          <label class="block text-[12px] text-[#9aa6b2] mb-1">电话 / 微信</label>
          <input
            v-model="tcForm.phone"
            maxlength="40"
            placeholder="方便时联系到 TA 的方式"
            class="w-full px-2.5 py-1.5 border border-[#e0e6ec] rounded-lg text-[14px] focus:outline-none focus:border-[#7c9cb8]"
          />
        </div>
        <div class="sm:col-span-2">
          <label class="block text-[12px] text-[#9aa6b2] mb-1">关系</label>
          <input
            v-model="tcForm.relation"
            maxlength="20"
            placeholder="如：家人"
            class="w-full px-2.5 py-1.5 border border-[#e0e6ec] rounded-lg text-[14px] focus:outline-none focus:border-[#7c9cb8]"
          />
        </div>
        <div class="sm:col-span-2">
          <button
            type="submit"
            :disabled="!tcForm.name.trim()"
            class="w-full py-1.5 bg-[#7c9cb8] text-white border-0 rounded-lg text-[13px] font-semibold disabled:opacity-50 hover:opacity-90 transition"
          >
            添加
          </button>
        </div>
      </form>
      <p v-if="tcError" class="text-[12px] text-[#e07a3f] m-0 mt-2">{{ tcError }}</p>
    </section>

    <!-- 打卡热力图 -->
    <section v-if="auth.currentUser" class="bg-white rounded-2xl border border-[#eef2f7] p-5 mb-5">
      <h2 class="text-[16px] font-bold text-[#3a4a5c] mb-3 m-0">📅 打卡日历</h2>
      <div v-if="checkinDates.length" class="flex flex-wrap gap-1">
        <div
          v-for="d in heatmap"
          :key="d.date"
          class="w-3.5 h-3.5 rounded-sm"
          :class="d.checked ? 'bg-[#7c9cb8]' : 'bg-[#eef2f7]'"
          :title="d.date + (d.checked ? ' ✓' : '')"
        ></div>
      </div>
      <p v-else class="text-[13px] text-[#9aa6b2] py-4 text-center m-0">记录心情或完成练习后，这里会出现你的打卡日历 🌱</p>
    </section>

    <!-- 我的收藏 -->
    <section v-if="auth.currentUser" class="bg-white rounded-2xl border border-[#eef2f7] p-5 mb-5">
      <h2 class="text-[16px] font-bold text-[#3a4a5c] mb-3 m-0">♥ 我的收藏</h2>
      <ul v-if="favorites.length" class="space-y-2">
        <li
          v-for="(f, i) in favorites"
          :key="i"
          class="flex items-center gap-2 py-2 border-b border-[#f3f6f9] last:border-0"
        >
          <span class="text-[12px] px-2 py-0.5 rounded-full bg-[#f0f4f9] text-[#5a6b7c] shrink-0">{{ typeLabel(f.type) }}</span>
          <a v-if="f.link" :href="f.link" class="flex-1 text-[14px] text-[#3a4a5c] no-underline truncate hover:text-[#7c9cb8] transition">{{ f.title || '未命名' }}</a>
          <span v-else class="flex-1 text-[14px] text-[#3a4a5c] truncate">{{ f.title || '未命名' }}</span>
        </li>
      </ul>
      <p v-else class="text-[13px] text-[#9aa6b2] py-4 text-center m-0">还没有收藏。去社区或知识页逛逛，点 ♥ 收藏你喜欢的～</p>
    </section>

    <!-- 功能区 -->
    <section v-if="!auth.currentUser" class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <RouterLink to="/mood" class="flex items-center gap-2.5 p-4 bg-white border border-[#eef2f7] rounded-xl no-underline hover:shadow-sm transition">
        <span class="text-[22px]">🌤️</span>
        <span class="text-[15px] font-semibold text-[#3a4a5c]">心情日记</span>
        <span class="ml-auto text-[13px] text-[#9aa6b2]">→</span>
      </RouterLink>
      <RouterLink to="/tools" class="flex items-center gap-2.5 p-4 bg-white border border-[#eef2f7] rounded-xl no-underline hover:shadow-sm transition">
        <span class="text-[22px]">🧰</span>
        <span class="text-[15px] font-semibold text-[#3a4a5c]">自助工具箱</span>
        <span class="ml-auto text-[13px] text-[#9aa6b2]">→</span>
      </RouterLink>
      <RouterLink to="/upload" class="flex items-center gap-2.5 p-4 bg-white border border-[#eef2f7] rounded-xl no-underline hover:shadow-sm transition">
        <span class="text-[22px]">🌱</span>
        <span class="text-[15px] font-semibold text-[#3a4a5c]">分享治愈瞬间</span>
        <span class="ml-auto text-[13px] text-[#9aa6b2]">→</span>
      </RouterLink>
      <RouterLink to="/feedback" class="flex items-center gap-2.5 p-4 bg-white border border-[#eef2f7] rounded-xl no-underline hover:shadow-sm transition">
        <span class="text-[22px]">✉️</span>
        <span class="text-[15px] font-semibold text-[#3a4a5c]">反馈建议</span>
        <span class="ml-auto text-[13px] text-[#9aa6b2]">→</span>
      </RouterLink>
    </section>
  </main>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useBadgeStore } from '../stores/badges'
import { useTrustedContactsStore } from '../stores/trustedContacts'
import { favoritesApi } from '../api/favorites'
import { checkinsApi } from '../api/checkins'
import BadgeWall from '../components/BadgeWall.vue'

const auth = useAuthStore()
const badgesStore = useBadgeStore()
const trusted = useTrustedContactsStore()
const favorites = ref([])
const checkinStats = ref({ streak: 0, total: 0 })
const checkinDates = ref([])

// 信任联系人：本地增删，PII 不上传
const tcForm = reactive({ name: '', phone: '', relation: '' })
const tcError = ref('')
function addContact() {
  const name = tcForm.name.trim()
  if (!name) {
    tcError.value = '请填写称呼'
    return
  }
  trusted.add({ name, phone: tcForm.phone, relation: tcForm.relation })
  tcForm.name = ''
  tcForm.phone = ''
  tcForm.relation = ''
  tcError.value = ''
}

const displayName = computed(() => {
  const u = auth.currentUser
  return u ? (u.name || u.username || '访客用户') : '访客用户'
})
const avatarText = computed(() => displayName.value.charAt(0) || '访')

// 近 90 天热力图
const heatmap = computed(() => {
  const set = new Set(checkinDates.value)
  const days = []
  const cn = () => {
    const d = new Date(Date.now() + 8 * 3600 * 1000)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  }
  const today = cn()
  const [y, m, day] = today.split('-').map(Number)
  const start = new Date(y, m - 1, day)
  for (let i = 89; i >= 0; i--) {
    const d = new Date(start)
    d.setDate(d.getDate() - i)
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    days.push({ date: ds, checked: set.has(ds) })
  }
  return days
})

function typeLabel(t) {
  return { moment: '治愈瞬间', post: '社区帖', card: '知识卡', quote: '小木语录' }[t] || t
}

function uidOf() {
  const u = auth.currentUser
  if (!u) return ''
  return u.type === 'github' ? `gh:${u.username}` : `g:${u.id}`
}

async function loadData() {
  const uid = uidOf()
  if (!uid) return
  try {
    const [favs, stats] = await Promise.all([favoritesApi.list(uid), checkinsApi.status(uid)])
    favorites.value = favs
    checkinStats.value = { streak: stats.streak, total: stats.total }
    checkinDates.value = stats.dates
  } catch (e) {
    favorites.value = []
    checkinStats.value = { streak: 0, total: 0 }
    checkinDates.value = []
  }
  // 成就徽章：合并服务端 + 客户端，检测新解锁（驱动庆祝弹窗）
  badgesStore.refresh(uid).catch(() => {})
}

onMounted(() => {
  auth.restoreUser()
  loadData()
})
</script>
