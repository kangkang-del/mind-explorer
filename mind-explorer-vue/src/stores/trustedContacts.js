import { defineStore } from 'pinia'

// 信任联系人：存在浏览器本地（敏感 PII，不进服务端，符合隐私模型；随设备）
const KEY = 'trusted_contacts_v1'

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}
function save(list) {
  localStorage.setItem(KEY, JSON.stringify(list))
}

export const useTrustedContactsStore = defineStore('trustedContacts', {
  state: () => ({ contacts: load() }),
  getters: {
    count: (s) => s.contacts.length,
  },
  actions: {
    add({ name, phone, relation }) {
      const id = 'tc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      this.contacts.push({
        id,
        name: (name || '').toString().trim(),
        phone: (phone || '').toString().trim(),
        relation: (relation || '').toString().trim(),
      })
      save(this.contacts)
    },
    remove(id) {
      this.contacts = this.contacts.filter((c) => c.id !== id)
      save(this.contacts)
    },
    update(id, patch) {
      const c = this.contacts.find((x) => x.id === id)
      if (c) {
        Object.assign(c, patch)
        save(this.contacts)
      }
    },
  },
})
