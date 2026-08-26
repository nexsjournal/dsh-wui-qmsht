import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { buildSystemPrompt } from '@/core/persona'
import { type Character } from '@/data'

/**
 * AI 角色对谈配置：用户自带 OpenAI 兼容 endpoint，前端直调 /chat/completions（非流式）。
 * 未配置时前端退回本地模式（persona.ts），功能不受影响。
 */
const LS_KEY = 'qmsht.llm.v1'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface Persist {
  baseUrl: string
  apiKey: string
  model: string
}

function load(): Persist {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persist>
      return {
        baseUrl: typeof p.baseUrl === 'string' && p.baseUrl ? p.baseUrl : 'https://api.openai.com/v1',
        apiKey: typeof p.apiKey === 'string' ? p.apiKey : '',
        model: typeof p.model === 'string' && p.model ? p.model : 'gpt-4o-mini',
      }
    }
  } catch {
    /* 忽略损坏数据 */
  }
  return { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' }
}

export const useLlmStore = defineStore('llm', () => {
  const p = load()
  const baseUrl = ref(p.baseUrl)
  const apiKey = ref(p.apiKey)
  const model = ref(p.model)

  const configured = computed(() => Boolean(baseUrl.value && apiKey.value && model.value))

  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ baseUrl: baseUrl.value, apiKey: apiKey.value, model: model.value } satisfies Persist))
    } catch {
      /* 隐私模式等场景静默 */
    }
  }

  function save() {
    persist()
  }

  /** 调用模型，返回角色回答；失败抛出带中文提示的 Error */
  async function chat(c: Character, messages: ChatMessage[]): Promise<string> {
    let res: Response
    try {
      res = await fetch(`${baseUrl.value.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.value}`,
        },
        body: JSON.stringify({
          model: model.value,
          messages: [{ role: 'system', content: buildSystemPrompt(c) }, ...messages.slice(-10)],
          max_tokens: 300,
          temperature: 0.8,
        }),
      })
    } catch {
      throw new Error('连不上模型服务')
    }
    if (!res.ok) {
      const msg = res.status === 401 || res.status === 403 ? '密钥无效或已过期' : res.status === 404 ? '端点或模型名有误' : `请求失败（${res.status}）`
      throw new Error(msg)
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) throw new Error('模型没有返回内容')
    return text
  }

  return { baseUrl, apiKey, model, configured, save, chat }
})
