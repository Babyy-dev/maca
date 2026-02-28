"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { clearStoredToken, getStoredToken } from "@/lib/maca-api"

type AuthActionButtonsProps = {
  containerClassName?: string
  loginClassName: string
  logoutClassName: string
  alwaysShowLogin?: boolean
  loginHref?: string
}

export default function AuthActionButtons({
  containerClassName = "flex flex-wrap gap-2",
  loginClassName,
  logoutClassName,
  alwaysShowLogin = false,
  loginHref = "/auth/login",
}: AuthActionButtonsProps) {
  const router = useRouter()
  const [hasToken, setHasToken] = useState(false)

  useEffect(() => {
    setHasToken(Boolean(getStoredToken()))
    const onStorage = () => {
      setHasToken(Boolean(getStoredToken()))
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  return (
    <div className={containerClassName}>
      {(alwaysShowLogin || !hasToken) && (
        <Link className={loginClassName} href={loginHref}>
          Login
        </Link>
      )}
      {hasToken ? (
        <button
          className={logoutClassName}
          onClick={() => {
            clearStoredToken()
            setHasToken(false)
            router.push("/auth/login")
          }}
          type="button"
        >
          Logout
        </button>
      ) : null}
    </div>
  )
}
