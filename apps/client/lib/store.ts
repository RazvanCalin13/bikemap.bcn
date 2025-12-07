import { create } from 'zustand'

interface Store {
  string: string
  setString: (value: string) => void
}

export const useStore = create<Store>((set) => ({
  string: '',
  setString: (value) => set({ string: value }),
}))
