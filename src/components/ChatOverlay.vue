<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { PERSONA_QUESTIONS, localAnswer, localGreeting } from '@/core/persona'
import { factionById, type Character } from '@/data'
import { useLlmStore, type ChatMessage } from '@/stores/llm'

const props = defineProps<{ char: Character | null; open: boolean }>()
defineEmits<{ close: [] }>()

const llm = useLlmStore()
const faction = computed(() => (props.char ? factionById.get(props.char.faction) : null))

interface Msg {
  role: 'ai' | 'user' | 'error'
  content: string
}

const msgs = ref<Msg[]>([])
const busy = ref(false)
const draft = ref('')
const cfgOpen = ref(false)
const msgsEl = ref<HTMLElement | null>(null)

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function toBottom() {
  void nextTick(() => {
    if (msgsEl.value) msgsEl.value.scrollTop = msgsEl.value.scrollHeight
  })
}

watch(() => msgs.value.length, toBottom)

// 每次打开重置为一句开场白
watch(
  () => props.open,
  (open) => {
    if (!open || !props.char) return
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    draft.value = ''
    msgs.value = [{ role: 'ai', content: localGreeting(props.char, Math.floor(Math.random() * 3)) }]
    toBottom()
  },
)

function history(): ChatMessage[] {
  return msgs.value
    .filter((m) => m.role !== 'error')
    .map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }))
}

async function ask(q: string) {
  const c = props.char
  const text = q.trim()
  if (!c || !text || busy.value) return
  msgs.value.push({ role: 'user', content: text })
  busy.value = true
  if (llm.configured) {
    try {
      const reply = await llm.chat(c, history())
      msgs.value.push({ role: 'ai', content: reply })
    } catch (e) {
      msgs.value.push({ role: 'error', content: e instanceof Error ? e.message : '请求失败' })
    }
  } else {
    await sleep(350 + Math.random() * 300)
    msgs.value.push({ role: 'ai', content: localAnswer(c, text, msgs.value.length) })
  }
  busy.value = false
  toBottom()
}

function sendDraft() {
  ask(draft.value)
  draft.value = ''
}
</script>

<template>
  <div v-if="open && char" class="chat">
    <div class="chat-panel">
      <header class="chat-head">
        <div class="chat-avatar">{{ char.name[0] }}</div>
        <div class="chat-who">
          <div class="chat-name">{{ char.name }}</div>
          <div class="chat-sub">{{ char.title }}<i v-if="faction">· {{ faction.name }}</i></div>
        </div>
        <button class="chat-close" aria-label="关闭对话" @click="$emit('close')">
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="1.6" fill="none">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div ref="msgsEl" class="chat-msgs">
        <div v-for="(m, i) in msgs" :key="i" class="chat-bubble" :class="m.role">
          <span class="chat-text">{{ m.content }}</span>
        </div>
        <div v-if="busy" class="chat-bubble ai">
          <span class="chat-text chat-dots">正在研思…</span>
        </div>
      </div>

      <div class="chat-chips">
        <button v-for="q in PERSONA_QUESTIONS" :key="q" class="chat-chip" :disabled="busy" @click="ask(q)">{{ q }}</button>
      </div>

      <div v-if="llm.configured" class="chat-inputrow">
        <input
          v-model="draft"
          class="chat-input"
          type="text"
          placeholder="问他点什么……"
          @keydown.enter="sendDraft"
        />
        <button class="chat-send" :disabled="busy || !draft.trim()" @click="sendDraft">送出</button>
      </div>

      <div v-else class="chat-cfg">
        <button class="chat-cfg-toggle" @click="cfgOpen = !cfgOpen">
          配置 AI 模型后可自由提问{{ cfgOpen ? ' ▲' : ' ▼' }}
        </button>
        <div v-if="cfgOpen" class="chat-cfg-box">
          <label class="chat-cfg-row">
            <span>接口地址</span>
            <input v-model="llm.baseUrl" type="text" placeholder="https://api.openai.com/v1" />
          </label>
          <label class="chat-cfg-row">
            <span>密钥</span>
            <input v-model="llm.apiKey" type="password" placeholder="sk-…" />
          </label>
          <label class="chat-cfg-row">
            <span>模型</span>
            <input v-model="llm.model" type="text" placeholder="gpt-4o-mini" />
          </label>
          <p class="chat-cfg-tip">仅存于本机 localStorage，直连你的 endpoint，不经任何第三方。</p>
          <button class="chat-cfg-save" @click="llm.save()">保存配置</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat {
  position: fixed;
  inset: 0;
  z-index: 58;
  background: rgba(27, 26, 23, 0.6);
}
.chat-panel {
  position: absolute;
  inset: 0;
  margin: 0 auto;
  max-width: 760px;
  display: flex;
  flex-direction: column;
  background: rgba(27, 26, 23, 0.96);
  border-inline: 1px solid var(--panel-line);
  padding: calc(16px + env(safe-area-inset-top, 0px)) 20px calc(14px + var(--safe-b));
  animation: chat-in 0.28s var(--ease-ink);
}
@keyframes chat-in {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
}

.chat-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--panel-line);
}
.chat-avatar {
  width: 44px;
  height: 44px;
  flex: none;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: 20px;
  color: var(--gold);
  border: 1px solid var(--panel-line);
  background: rgba(201, 169, 106, 0.08);
}
.chat-who {
  flex: 1;
  min-width: 0;
}
.chat-name {
  font-family: var(--font-display);
  font-size: 17px;
  color: var(--text);
}
.chat-sub {
  font-size: 12px;
  color: var(--text-2);
}
.chat-close {
  flex: none;
  padding: 8px;
  color: var(--text-2);
  background: none;
  border: none;
}
.chat-close:hover {
  color: var(--text);
}

.chat-msgs {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 16px 0 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.chat-bubble {
  max-width: 82%;
  padding: 10px 14px;
  font-size: 14.5px;
  line-height: 1.75;
}
.chat-bubble.ai {
  align-self: flex-start;
  color: var(--text);
  background: rgba(201, 169, 106, 0.12);
  border: 1px solid var(--panel-line);
  border-inline-start: 3px solid var(--gold);
}
.chat-bubble.user {
  align-self: flex-end;
  color: var(--text);
  background: var(--panel);
  border: 1px solid var(--panel-line);
}
.chat-bubble.error {
  align-self: flex-start;
  color: #e8a49b;
  background: rgba(176, 58, 46, 0.12);
  border: 1px solid rgba(176, 58, 46, 0.4);
}
.chat-dots {
  color: var(--text-2);
  font-size: 13px;
}

.chat-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 0 4px;
  border-top: 1px solid var(--panel-line);
}
.chat-chip {
  font-size: 13px;
  color: var(--text-2);
  background: none;
  border: 1px solid var(--panel-line);
  padding: 6px 12px;
  transition: color 0.2s, border-color 0.2s;
}
.chat-chip:hover:not(:disabled) {
  color: var(--gold);
  border-color: var(--gold);
}
.chat-chip:disabled {
  opacity: 0.4;
}

.chat-inputrow {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.chat-input {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: var(--text);
  background: var(--panel);
  border: 1px solid var(--panel-line);
  padding: 9px 12px;
  outline: none;
}
.chat-input:focus {
  border-color: var(--gold);
}
.chat-send {
  flex: none;
  font-family: var(--font-display);
  font-size: 14px;
  color: #1b1a17;
  background: var(--gold);
  border: none;
  padding: 0 18px;
  transition: opacity 0.2s;
}
.chat-send:disabled {
  opacity: 0.4;
}

.chat-cfg {
  margin-top: 10px;
}
.chat-cfg-toggle {
  font-size: 12.5px;
  color: var(--text-2);
  background: none;
  border: none;
  padding: 4px 0;
}
.chat-cfg-toggle:hover {
  color: var(--gold);
}
.chat-cfg-box {
  margin-top: 8px;
  padding: 12px;
  border: 1px dashed var(--panel-line);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.chat-cfg-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-2);
}
.chat-cfg-row span {
  flex: none;
  width: 56px;
}
.chat-cfg-row input {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text);
  background: var(--panel);
  border: 1px solid var(--panel-line);
  padding: 7px 10px;
  outline: none;
}
.chat-cfg-row input:focus {
  border-color: var(--gold);
}
.chat-cfg-tip {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-2);
  opacity: 0.8;
}
.chat-cfg-save {
  align-self: flex-start;
  font-size: 13px;
  color: #1b1a17;
  background: var(--gold);
  border: none;
  padding: 7px 16px;
}

@media (min-width: 720px) {
  .chat-panel {
    top: 6vh;
    bottom: 6vh;
    left: 50%;
    right: auto;
    width: min(760px, 92vw);
    transform: translateX(-50%);
    border: 1px solid var(--panel-line);
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
  }
}
</style>
