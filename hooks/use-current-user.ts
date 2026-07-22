"use client"

import { useEffect, useState } from "react"

import { AUTH_SESSION_EVENT, getFreshSavedSession, getSavedSessionDisplayName, getSavedSessionEmail } from "@/lib/auth-session"
import { CurrentUser, getDefaultUser } from "@/lib/user-roles"

type CurrentUserState = {
  user: CurrentUser | null
  isLoading: boolean
}

function getCurrentEmail() {
  return getSavedSessionEmail()
}

export function useCurrentUser() {
  const [state, setState] = useState<CurrentUserState>({ user: null, isLoading: true })

  useEffect(() => {
    let isActive = true

    async function loadUser() {
      const email = getCurrentEmail()

      if (!email) {
        if (isActive) setState({ user: null, isLoading: false })
        return
      }

      setState((current) => ({ ...current, isLoading: true }))
      const sessionDisplayName = getSavedSessionDisplayName()

      try {
        const session = await getFreshSavedSession()
        const token = session?.access_token
        let user: CurrentUser | null = null

        if (token) {
          const response = await fetch("/api/users/me", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          })

          if (response.ok) {
            user = (await response.json()) as CurrentUser
          }
        }

        if (!user) {
          const response = await fetch(`/api/airtable/users?email=${encodeURIComponent(email)}`, {
            cache: "no-store",
          })

          if (!response.ok) {
            throw new Error("Unable to load user profile")
          }

          user = (await response.json()) as CurrentUser
        }

        if (isActive) {
          setState({
            user,
            isLoading: false,
          })
        }
      } catch {
        if (isActive) setState({ user: getDefaultUser(email, sessionDisplayName), isLoading: false })
      }
    }

    function handleSessionChange() {
      void loadUser()
    }

    void loadUser()
    window.addEventListener("storage", handleSessionChange)
    window.addEventListener(AUTH_SESSION_EVENT, handleSessionChange)

    return () => {
      isActive = false
      window.removeEventListener("storage", handleSessionChange)
      window.removeEventListener(AUTH_SESSION_EVENT, handleSessionChange)
    }
  }, [])

  return state
}
