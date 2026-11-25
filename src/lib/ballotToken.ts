// The ballot token is the only way back to a ballot, so it lives in this
// browser. Storage can be missing or blocked; then the voter can still vote,
// just not change it later.
const key = (meetupId: string, userId: string) => `tiny-bee:ballot:${meetupId}:${userId}`

export function readBallotToken(meetupId: string, userId: string): string | null {
  try {
    return window.localStorage.getItem(key(meetupId, userId))
  } catch {
    return null
  }
}

export function saveBallotToken(meetupId: string, userId: string, token: string): boolean {
  try {
    window.localStorage.setItem(key(meetupId, userId), token)
    return true
  } catch {
    return false
  }
}
