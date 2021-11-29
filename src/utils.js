import SnuOwnd from 'snuownd'

const markdown = SnuOwnd.getParser()

// Fetches JSON at the given url or throws a descriptive Error
export const fetchJson = (url, init = {}) =>
  window.fetch(url, init)
    .then(response => response.ok ?
      response.json()
        .catch(error => {
          throw new Error((response.statusText || response.status) + ', ' + error)
        }) :
      response.text()
        .catch(error => {
          throw new Error((response.statusText || response.status) + ', ' + error)
        }).then(text => {
          throw new Error((response.statusText || response.status) + ': ' + text)
        })
    )

// Take on big array and split it into an array of chunks with correct size
export const chunk = (arr, size) => {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

// Change bases
export const toBase36 = number => parseInt(number, 10).toString(36)
export const toBase10 = numberString => parseInt(numberString, 36)

// Reddits way of indicating that something is deleted (the '\\' is for Reddit and the other is for pushshift)
export const isDeleted = textBody => textBody === '\\[deleted\\]' || textBody === '[deleted]'

// Reddits way of indicating that something is deleted
export const isRemoved = textBody => textBody === '\\[removed\\]' || textBody === '[removed]'

// Default thumbnails for reddit threads
export const redditThumbnails = ['self', 'default', 'image', 'nsfw']

// Parse comments (see https://www.reddit.com/dev/api/#response_body_encoding)
export const parse = text => markdown.render(text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&'))

// UTC to "Reddit time format" (e.g. 5 hours ago, just now, etc...)
export const prettyDate = createdUTC => {
  const currentUTC = Math.floor((new Date()).getTime() / 1000)

  const secondDiff = currentUTC - createdUTC
  if (secondDiff < 86400) {
    if (secondDiff < 10) return 'just now'
    if (secondDiff < 60) return `${secondDiff} seconds ago`
    if (secondDiff < 120) return 'a minute ago'
    if (secondDiff < 3600) return `${Math.floor(secondDiff / 60)} minutes ago`
    if (secondDiff < 7200) return 'an hour ago'
    return `${Math.floor(secondDiff / 3600)} hours ago`
  }

  const dayDiff = Math.floor(secondDiff / 86400)
  if (dayDiff < 2) return '1 day ago'
  if (dayDiff < 7) return `${dayDiff} days ago`
  if (dayDiff < 14) return '1 week ago'
  if (dayDiff < 31) return `${Math.floor(dayDiff / 7)} weeks ago`
  if (dayDiff < 60) return '1 month ago'
  if (dayDiff < 365) return `${Math.floor(dayDiff / 30)} months ago`
  if (dayDiff < 730) return '1 year ago'
  return `${Math.floor(dayDiff / 365)} years ago`
}

// The date and time, to the second, formatted in the user's locale
export const exactDateTime = utc => {
  const datetime = new Date(utc * 1000)
  if (new Date().toDateString() == datetime.toDateString())
    return datetime.toLocaleTimeString([], {timeStyle: 'long'})
  else
    return datetime.toLocaleString([], {dateStyle: 'medium', timeStyle: 'long'})
}

// Time difference in seconds to text, rounded up by default (e.g. x seconds/minutes/hours)
export const prettyTimeDiff = (secondDiff, roundDown = false) => {
  if (secondDiff < 2) return `1 second`
  if (secondDiff < 120) return `${secondDiff} seconds`
  const round = roundDown ? Math.floor : Math.ceil
  if (secondDiff < 7200) return `${round(secondDiff / 60)} minutes`
  if (secondDiff < 172800) return `${round(secondDiff / 3600)} hours`
  const days = round(secondDiff / 86400)
  if (days < 10 && roundDown) return `${days} days, ${round((secondDiff - days*86400) / 3600)} hours`
  return `${days} days`
}

// Reddit format for scores, e.g. 12000 => 12k
export const prettyScore = score => {
  if (score >= 100000) {
    return `${(score / 1000).toFixed(0)}k`
  } else if (score >= 10000) {
    return `${(score / 1000).toFixed(1)}k`
  }

  return score
}

// Retrieve, store and delete stuff in the local storage
export const get = (key, defaultValue) => {
  const value = window.localStorage.getItem(key)
  return value !== null ? JSON.parse(value) : defaultValue
}

export const put = (key, value) => window.localStorage.setItem(key, JSON.stringify(value))

// Sorting for comments
export const topSort = (commentA, commentB) => {
  if (commentA.score > commentB.score) return -1
  if (commentA.score < commentB.score) return 1
  return 0
}

export const bottomSort = (commentA, commentB) => {
  if (commentA.score < commentB.score) return -1
  if (commentA.score > commentB.score) return 1
  return 0
}

export const newSort = (commentA, commentB) => {
  if (commentA.created_utc > commentB.created_utc) return -1
  if (commentA.created_utc < commentB.created_utc) return 1
  return 0
}

export const oldSort = (commentA, commentB) => {
  if (commentA.created_utc < commentB.created_utc) return -1
  if (commentA.created_utc > commentB.created_utc) return 1
  return 0
}

// Filter comments
export const showRemoved = comment => comment.removed === true
export const showDeleted = comment => comment.deleted === true
export const showRemovedAndDeleted = comment => comment.removed === true || comment.deleted === true
