import React from 'react'
import { Subscribe, Container } from 'unstated'
import { get, put } from './utils'

// Sort types for comments
export const sort = {
  top: 'SORT_TOP',
  bottom: 'SORT_BOTTOM',
  new: 'SORT_NEW',
  old: 'SORT_OLD'
}

// Filter types for comments
export const filter = {
  all: 'SHOW_ALL',
  removedDeleted: 'SHOW_REMOVED_DELETED',
  removed: 'SHOW_REMOVED',
  deleted: 'SHOW_DELETED'
}

export const maxCommentsDefault = 1000
export const maxCommentsLimit   = 20000

// Keys for localStorage
const sortKey = 'commentSort'
const filterKey = 'commentFilter'
const maxCommentsKey = 'maxComments'

class GlobalState extends Container {
  state = {
    commentSort: get(sortKey, sort.top),
    commentFilter: get(filterKey, filter.removedDeleted),
    maxComments: get(maxCommentsKey, maxCommentsDefault),
    statusText: '',
    statusHelpUrl: undefined,
    statusImage: undefined
  }

  setCommentSort (sortType) {
    put(sortKey, sortType)
    this.setState({commentSort: sortType})
  }

  setCommentFilter (filterType) {
    put(filterKey, filterType)
    this.setState({commentFilter: filterType})
  }

  saveMaxComments (maxComments) {
    maxComments = Math.min(Math.round(maxComments), maxCommentsLimit)
    if (!(maxComments >= 100))  // also true when maxComments isn't a number
      maxComments = 100
    put(maxCommentsKey, maxComments)
    return maxComments
  }

  loadMaxComments = () => this.setState({maxComments: get(maxCommentsKey, maxCommentsDefault)})

  setSuccess = () => this.setState({statusText: '', statusHelpUrl: undefined, statusImage: '/images/success.png'})
  setLoading = (text) => this.setState({statusText: text, statusImage: '/images/loading.gif'})
  setError = (error, helpUrl = undefined) => {
    this.setState({statusText: error.message, statusImage: '/images/error.png'})
    if (helpUrl)
      this.setState({statusHelpUrl: helpUrl})
  }
  clearStatus = () => this.setState({statusText: '', statusHelpUrl: undefined, statusImage: undefined})
}

// A redux-like connect function for Unstated
export const connect = Component => {
  return props => (
    <Subscribe to={[GlobalState]}>
      {globalState => <Component {...props} global={globalState} />}
    </Subscribe>
  )
}
