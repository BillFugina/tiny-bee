import { createContext, useContext, useEffect } from 'react'

/** Lets the meetup page put its title in the site header while it's open. */
export const ActiveMeetupContext = createContext<(title: string | null) => void>(() => {})

export function useActiveMeetupTitle(title: string) {
  const setTitle = useContext(ActiveMeetupContext)
  useEffect(() => {
    setTitle(title)
    return () => setTitle(null)
  }, [setTitle, title])
}
