/// <reference types="vite/client" />

export {}

declare global {
  interface Window {
    /** preload 暴露的白名单 API；跨进程边界，类型在这里先保持宽松。 */
    launcher?: any
  }

  /**
   * 渲染层大量直接操作 DOM。查询结果先保持宽松类型，
   * 后续拆页面时再逐处收紧到具体元素类型（input、button 等）。
   */
  interface Document {
    querySelector<E = any>(selectors: string): E | null
    querySelectorAll<E = any>(selectors: string): NodeListOf<E>
  }

  /**
   * 过渡期的 DOM 近似：应用只在表单/详情元素上读这些字段。
   * 逐页拆分后再把这些属性收紧到具体元素类型。
   */
  interface EventTarget {
    dataset: DOMStringMap
    id: string
    value: string
    readOnly: boolean
    open: boolean
    disabled: boolean
    matches(selector: string): boolean
    closest(selector: string): HTMLElement | null
    parentElement: HTMLElement | null
  }

  interface HTMLElement {
    value: string
    disabled: boolean
    open: boolean
  }
}

declare module '*.css'
