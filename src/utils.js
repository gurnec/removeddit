import SnuOwnd from 'snuownd'

const markdown = SnuOwnd.getParser()

// Fetches JSON at the given url or throws a descriptive Error
export const fetchJson = (url, init = {}) => fetchJsonAndHeaders(url, init)
  .then(response => response.json)

// Fetches JSON, returning an object with a .json and a .headers member
export const fetchJsonAndHeaders = (url, init = {}) =>
  window.fetch(url, init)
    .then(response => response.ok ?
      {
        json: response.json()
          .catch(error => {
            throw new Error((response.statusText || response.status) + ', ' + error)
          }),
        headers: response.headers
      } :
      response.text()
        .catch(error => {
          throw new Error((response.statusText || response.status) + ', ' + error)
        }).then(text => {
          throw new Error((response.statusText || response.status) + ': ' + text)
        })
    )

export const sleep = ms =>
  new Promise(slept => setTimeout(slept, ms))

// Reddits way of indicating that something is deleted (the '\\' is for Reddit and the other is for pushshift)
export const isDeleted = textBody => textBody === '\\[deleted\\]' || textBody === '[deleted]'

// Reddits way of indicating that something is deleted
export const isRemoved = textBody => textBody === '\\[removed\\]' || textBody === '[removed]' || textBody === '[ Removed by Reddit ]'

// Default thumbnails for reddit threads
export const redditThumbnails = ['self', 'default', 'image', 'nsfw', 'spoiler']

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
export const topSort    = (commentA, commentB) => commentB.score - commentA.score
export const bottomSort = (commentA, commentB) => commentA.score - commentB.score
export const newSort = (commentA, commentB) => commentB.created_utc - commentA.created_utc
export const oldSort = (commentA, commentB) => commentA.created_utc - commentB.created_utc

// Filter comments
export const showRemoved = comment => comment.removed === true
export const showDeleted = comment => comment.deleted === true
export const showRemovedAndDeleted = comment => comment.removed === true || comment.deleted === true

// Edited text display modes
export const editedModes = {
  dfault: 0,  // diff mode if it's been edited, otherwise same as orig
  orig:   1,
  edited: 2,
  length: 3
}
export const editedTitles = [
  'Edits are highlighted; click to change',
  'The first archived edit is shown; click to change',
  'The most recent edit is shown; click to change'
]
