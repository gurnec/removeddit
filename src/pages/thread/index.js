import React from 'react'
import { Link } from 'react-router-dom'
import {
  getPost,
  getComments as getRedditComments,
  getParentComments,
  chunkSize as redditChunkSize
} from '../../api/reddit'
import {
  getPost as getPushshiftPost,
  getComments as getPushshiftComments,
  getCommentsFromIds,
  chunkSize as pushshiftChunkSize
} from '../../api/pushshift'
import { isDeleted, isRemoved, sleep, get, put } from '../../utils'
import { connect, constrainMaxComments } from '../../state'
import Post from '../common/Post'
import CommentSection from './CommentSection'
import SortBy from './SortBy'
import CommentInfo from './CommentInfo'
import LoadMore from './LoadMore'
import Modal from './Modal'

// A FIFO queue with items pushed in individually, and shifted out in an Array of chunkSize
class ChunkedQueue {

  constructor(chunkSize) {
    if (!(chunkSize > 0))
      throw RangeError('chunkSize must be > 0')
    this._chunkSize = chunkSize
    this._chunks = [[]]  // Array of Arrays
    // Invariant: this._chunks always contains at least one Array
  }

  push(x) {
    const last = this._chunks[this._chunks.length - 1]
    if (last.length < this._chunkSize)
      last.push(x)
    else
      this._chunks.push([x])
  }

  hasFullChunk = () => this._chunks[0].length >= this._chunkSize * 0.9
  isEmpty      = () => this._chunks[0].length == 0

  shiftChunk() {
    const first = this._chunks.shift()
    if (this._chunks.length == 0)
      this._chunks.push([])
    return first
  }
}

// The .firstCreated of the contig containing a post's first comment (see contigs below)
const EARLIEST_CREATED = 1

// Key for localStorage
const dismissModalKey = 'modal'

class Thread extends React.Component {
  state = {
    post: {},
    pushshiftCommentLookup: new Map(),
    removed: 0,
    deleted: 0,
    context: 0,
    moreContextAvail: true,
    allCommentsFiltered: false,
    loadedAllComments: false,
    loadingComments: true,
    reloadingComments: false,
    showModal: !get(dismissModalKey)
  }
  nextMoreContextAvail = true
  nextAllCommentsFiltered = false

  // A 'contig' is an object representing a contiguous block of comments currently being downloaded or already
  // downloaded, e.g. { firstCreated: #, lastCreated: # } (secs past the epoch; min. value of EARLIEST_CREATED)
  contigs = []  // sorted non-overlapping array of contig objects
  curContigIdx = 0
  curContig  () { return this.contigs[this.curContigIdx] }
  nextContig () { return this.contigs[this.curContigIdx + 1] }

  // If the current contig and the next probably overlap, merge them
  // (should only be called if there's another reason to believe they overlap)
  mergeContigs () {
    const nextContig = this.nextContig()
    if (this.curContig().lastCreated >= nextContig?.firstCreated)  // probably; definitely would be '>'
      nextContig.firstCreated = this.contigs.splice(this.curContigIdx, 1)[0].firstCreated
    else
      console.warn("Can't merge contigs", this.curContig(), "and", nextContig)  // shouldn't happen
  }

  // Convert Reddit fullnames to their short ID (base36) form
  fullnamesToShortIDs (comment) {
    comment.parent_id = comment.parent_id?.substring(3) || this.props.match.params.threadID
    comment.link_id = comment.link_id?.substring(3)     || this.props.match.params.threadID
    return comment
  }

  // Can be called when a comment is missing from Pushshift;
  // the comment's ids must have already been updated by fullnamesToShortIDs()
  useRedditComment (comment) {
    if (isRemoved(comment.body)) {
      this.state.removed++  // eslint-disable-line react/no-direct-mutation-state
      comment.removed = true
    } else if (isDeleted(comment.body)) {
      this.state.deleted++  // eslint-disable-line react/no-direct-mutation-state
      comment.deleted = true
    }
    this.state.pushshiftCommentLookup.set(comment.id, comment)
  }

  commentIdAttempts = new Set()  // keeps track of attempts to load permalinks to avoid reattempts

  componentDidMount () {
    const { subreddit, threadID, commentID } = this.props.match.params
    const { location } = this.props
    this.setState({ post: {subreddit, id: threadID} })
    this.props.global.setLoading('Loading post...')
    console.time('Load comments')

    // Get post from Reddit. Each code path below should end in either
    //   setLoading() on success (if comments are still loading), or
    //   setError() and assigning stopLoading = true on failure.
    getPost(threadID)
      .then(post => {
        document.title = post.title
        if (isDeleted(post.selftext))
          post.deleted = true
        else if (isRemoved(post.selftext) || post.removed_by_category)
          post.removed = true

        if (post.is_self === false ? !post.deleted : !post.deleted && !post.removed && !post.edited) {
          this.setState({ post })
          if (this.state.loadingComments)
            this.props.global.setLoading('Loading comments...')

        // Fetch the post from Pushshift if it was deleted/removed/edited
        } else {
          const redditSelftext = post.selftext
          if (post.is_self)
            post.selftext = '...'  // temporarily remove selftext to avoid flashing it onscreen
          this.setState({ post })
          getPushshiftPost(threadID)
            .then(origPost => {
              if (origPost) {

                // If found on Pushshift, and deleted on Reddit, use Pushshift's post instead
                if (post.deleted || post.removed) {
                  origPost.score = post.score
                  origPost.num_comments = post.num_comments
                  origPost.edited = post.edited
                  if (post.deleted)
                    origPost.deleted = true
                  else
                    origPost.removed = true
                  this.setState({ post: origPost })

                // If found on Pushshift, but it was only edited, update and use the Reddit post
                } else {
                  if (redditSelftext != origPost.selftext && !isRemoved(origPost.selftext)) {
                    post.selftext = origPost.selftext
                    post.edited_selftext = redditSelftext
                  } else
                    post.selftext = redditSelftext  // edited selftext not archived by Pushshift, use Reddit's
                  this.setState({ post })
                }

              // Else if not found on Pushshift, nothing to do except restore the selftext (removed above)
              } else {
                post.selftext = redditSelftext
                this.setState({ post })
              }

              if (this.state.loadingComments)
                this.props.global.setLoading('Loading comments...')
            })
            .catch(error => {
              console.timeEnd('Load comments')
              this.props.global.setError(error, error.helpUrl)
              this.stopLoading = true
              post.selftext = redditSelftext  // restore it (after temporarily removing it above)
              this.setState({ post })
            })
        }
      })
      .catch(error => {
        const origMessage = error.origError?.message

        // Fetch the post from Pushshift if quarantined/banned (403) or not found (404)
        if (origMessage && (origMessage.startsWith('403') || origMessage.startsWith('404'))) {
          getPushshiftPost(threadID)
            .then(removedPost => {
              if (removedPost) {
                document.title = removedPost.title
                this.setState({ post: { ...removedPost, removed: true } })
                if (this.state.loadingComments)
                  this.props.global.setLoading('Loading comments...')
              } else {
                if (origMessage.startsWith('403')) {  // If Reddit admits it exists but Pushshift can't find it, then
                  this.setState({ post: { id: threadID, subreddit, removed: true } })  // create a dummy post and continue
                  if (this.state.loadingComments)
                    this.props.global.setLoading('Loading comments...')
                } else {
                  console.timeEnd('Load comments')
                  this.props.global.setError({ message: '404 Post not found' })
                  this.stopLoading = true
                }
              }
            })
            .catch(error => {
              console.timeEnd('Load comments')
              this.props.global.setError(error, error.helpUrl)
              this.stopLoading = true
            })

        } else {
          console.timeEnd('Load comments')
          this.props.global.setError(error, error.helpUrl)
          this.stopLoading = true
        }
      })

    // The max_comments query parameter can increase the initial comments-to-download
    const searchParams = new URLSearchParams(location.search)
    const maxComments = Math.max(this.props.global.maxComments,
      constrainMaxComments(parseInt(searchParams.get('max_comments'))))

    // Get comments starting from the earliest available (not a permalink)
    if (commentID === undefined) {
      this.contigs.unshift({firstCreated: EARLIEST_CREATED})
      this.getComments(maxComments)

    // Get comments starting from the permalink if possible, otherwise from the earliest available
    } else {
      this.commentIdAttempts.add(commentID)
      getRedditComments([commentID])
        .then(([comment]) => {
          if (comment)
            this.fullnamesToShortIDs(comment)
          if (comment?.link_id != threadID) {
            console.timeEnd('Load comments')
            this.props.global.setError({ message: 'Invalid permalink' })
            this.setState({loadingComments: false})
            console.error('link_id mismatch:', comment)
            return
          }
          const context = parseInt(searchParams.get('context'))
          if (context > 0)
            this.contextPromise = this.getContext(context)
          this.contigs.unshift({firstCreated: comment?.created_utc || EARLIEST_CREATED})
          this.getComments(maxComments, false, comment)
        })
        .catch(() => {
          this.contigs.unshift({firstCreated: EARLIEST_CREATED})
          this.getComments(maxComments)
        })

      // Set the scroll location to just below the post if not already set (only with permalinks)
      if (!location.hash)
        location.hash = '#comment-info'
    }

    if (location.hash) {
      location.state = {scrollBehavior: 'smooth'}
      if (location.hash.startsWith('#thing_t1_'))
        location.hash = '#' + location.hash.substring(10)
    }
  }

  // Updates this.curContigIdx based on URL's commentID if it's already downloaded.
  // Returns true on success, or false if not found (and then curContigIdx is not updated).
  updateCurContig () {
    const { commentID } = this.props.match.params
    let curContigIdx = -1
    if (commentID === undefined)
      curContigIdx = this.contigs[0]?.firstCreated == EARLIEST_CREATED ? 0 : -1
    else {
      const created_utc = this.state.pushshiftCommentLookup.get(commentID)?.created_utc
      if (created_utc > EARLIEST_CREATED)
        curContigIdx = this.contigs.findIndex(contig => created_utc >= contig.firstCreated && created_utc <= contig.lastCreated)
    }
    if (curContigIdx < 0)
      return false
    this.setCurContig(curContigIdx)
    return true
  }
  setCurContig (idx) {
    this.curContigIdx = idx
    // When the current contig changes, loadedAllComments might also change
    const loadedAllComments = Boolean(this.curContig().loadedAllComments)
    if (this.state.loadedAllComments != loadedAllComments)
      this.setState({loadedAllComments})
  }

  componentDidUpdate () {
    let { loadingComments } = this.state
    const { commentID } = this.props.match.params

    // If the max-to-download Reload button or 'load more comments' was clicked
    const { loadingMoreComments } = this.props.global.state
    if (loadingMoreComments) {
      this.props.global.state.loadingMoreComments = 0
      this.setState({reloadingComments: true})
      this.props.global.setLoading('Loading comments...')
      console.time('Load comments')
      this.updateCurContig()
      this.getComments(loadingMoreComments, true)

    // Otherwise if we're not already downloading comments, check to see if we need to start
    } else if (!loadingComments && !this.state.reloadingComments) {

      // If we're loading a comment tree we haven't downloaded yet
      if (!this.updateCurContig()) {

        // If we haven't downloaded from the earliest available yet (not a permalink)
        if (commentID === undefined) {
          loadingComments = true
          this.setState({loadingComments})
          this.props.global.setLoading('Loading comments...')
          console.time('Load comments')
          this.contigs.unshift({firstCreated: EARLIEST_CREATED})
          this.setCurContig(0)
          this.getComments(this.props.global.maxComments)

        // Otherwise if we haven't downloaded this permalink yet
        } else if (!this.commentIdAttempts.has(commentID)) {
          this.commentIdAttempts.add(commentID)
          this.setState({reloadingComments: true})
          this.props.global.setLoading('Loading comments...')
          console.time('Load comments')
          let createdUtcNotFound  // true if Reddit doesn't have the comment's created_utc
          const hasComment = this.state.pushshiftCommentLookup.get(commentID);
          (hasComment ? Promise.resolve([hasComment]) : getRedditComments([commentID]))
            .then(([comment]) => {
              const created_utc = comment?.created_utc
              if (created_utc > EARLIEST_CREATED) {
                let insertBefore = this.contigs.findIndex(contig => created_utc < contig.firstCreated)
                if (insertBefore == -1)
                  insertBefore = this.contigs.length

                // If comment isn't inside an existing contig, create a new one and start downloading
                if (insertBefore == 0 || created_utc >= this.contigs[insertBefore - 1].lastCreated) {
                  this.contigs.splice(insertBefore, 0, {firstCreated: created_utc})
                  this.setCurContig(insertBefore)
                  if (!hasComment)
                    this.fullnamesToShortIDs(comment)
                  this.getComments(this.props.global.maxComments, false, comment)

                // Otherwise an earlier attempt to download it from Pushshift turned up nothing,
                } else if (!hasComment) {
                  this.fullnamesToShortIDs(comment)
                  this.useRedditComment(comment)       // so use the Reddit comment instead
                  this.setCurContig(insertBefore - 1)  // (this was the failed earlier attempt)
                  console.timeEnd('Load comments')
                  this.props.global.setSuccess()
                  this.setState({loadingComments: false, reloadingComments: false})
                } else
                  createdUtcNotFound = true
              } else
                createdUtcNotFound = true
            })
            .catch(() => createdUtcNotFound = true)
            .finally(() => {
              if (createdUtcNotFound) {
                // As a last resort, try to download starting from the previous contig;
                // this only occurs once per commentID due to the commentIdAttempts Set.
                if (this.curContigIdx > 0)
                  this.setCurContig(this.curContigIdx - 1)
                // If there is no previous, create one
                else if (this.curContig().firstCreated != EARLIEST_CREATED)
                  this.contigs.unshift({firstCreated: EARLIEST_CREATED})
                this.getComments(this.props.global.maxComments)
              }
            })
        }
      } // end of "If we're loading a comment tree we haven't downloaded yet"

      // Check if the context query parameter has changed
      if (commentID) {
        const context = Math.max(parseInt((new URLSearchParams(this.props.location.search)).get('context')) || 0, 0)
        if (context > this.state.context) {
          this.setState({reloadingComments: true})
          this.props.global.setLoading('Loading comments...')
          console.time('Load comments')
          this.getContext(context)  // also updates state.context
            .then(commentCount => {
              console.log('Reddit:', commentCount, 'comments')
              console.timeEnd('Load comments')
              this.props.global.setSuccess()
              this.setState({loadingComments: false, reloadingComments: false})
            })
        } else if (context != this.state.context)
          this.setState({ context })
      } else if (0 != this.state.context)
        this.setState({ context: 0 })

    } // end of "If we're not already downloading comments, check to see if we need to start"

    // Handle any requested scrolling
    const { location } = this.props
    if (location.state?.scrollBehavior && location.hash.length > 1 &&
        !loadingComments && !this.props.global.isErrored()) {
      const hashElem = document.getElementById(location.hash.substring(1))
      if (hashElem) {
        hashElem.scrollIntoView({behavior: location.state.scrollBehavior})
        delete location.state
      }
    }

    if (this.nextMoreContextAvail != this.state.moreContextAvail)
      this.setState({moreContextAvail: this.nextMoreContextAvail})
    if (this.nextAllCommentsFiltered != this.state.allCommentsFiltered)
      this.setState({allCommentsFiltered: this.nextAllCommentsFiltered})
  }

  // Before calling, state.pushshiftCommentLookup must be populated.
  // Compares an array of Reddit comments with those in pushshiftCommentLookup,
  // updating them to reflect their removed/deleted/edited status and then
  // updates the state's removed/deleted count. Returns the number processed.
  compareAndUpdateComments (redditComments) {
    if (redditComments.length == 0)
      return 0
    const { pushshiftCommentLookup } = this.state
    let removed = 0, deleted = 0
    redditComments.forEach(redditComment => {
      let pushshiftComment = pushshiftCommentLookup.get(redditComment.id)
      if (pushshiftComment === undefined) {
        // When a parent comment is missing from pushshift, use the redditComment instead
        pushshiftComment = this.fullnamesToShortIDs(redditComment)
        pushshiftCommentLookup.set(pushshiftComment.id, pushshiftComment)
      } else {
        // Replace pushshift score with reddit (it's usually more accurate)
        pushshiftComment.score = redditComment.score
      }

      // Check what is removed / deleted according to reddit
      if (isRemoved(redditComment.body)) {
        removed++
        pushshiftComment.removed = true
      } else if (isDeleted(redditComment.body)) {
        deleted++
        pushshiftComment.deleted = true
      } else if (pushshiftComment !== redditComment) {
        if (isRemoved(pushshiftComment.body)) {
          // If it's deleted in pushshift, but later restored by a mod, use the restored
          this.fullnamesToShortIDs(redditComment)
          pushshiftCommentLookup.set(redditComment.id, redditComment)
        } else if (pushshiftComment.body != redditComment.body) {
          pushshiftComment.edited_body = redditComment.body
          pushshiftComment.edited = redditComment.edited
        }
      }
    })
    this.setState({ removed: this.state.removed + removed, deleted: this.state.deleted + deleted })
    return redditComments.length
  }

  // Before calling, either create (and set to current) a new contig to begin downloading
  // after a new time, or set the current contig to begin adding to the end of that contig.
  //   persistent: if true, will try to continue downloading after the current contig has
  //               been completed and merged with the next contig.
  //  commentHint: a Reddit comment for use if Pushshift is missing that same comment;
  //               its ids must have already been updated by fullnamesToShortIDs()
  getComments (newCommentCount, persistent = false, commentHint = undefined) {
    const { threadID, commentID } = this.props.match.params
    const { pushshiftCommentLookup } = this.state
    const redditIdQueue = new ChunkedQueue(redditChunkSize)
    const pushshiftPromises = [], redditPromises = []
    let doRedditComments

    // Process a chunk of comments downloaded from Pushshift (called by getPushshiftComments() below)
    const processPushshiftComments = comments => {
      if (comments.length && !this.stopLoading) {
        pushshiftPromises.push(sleep(0).then(() => {
          let count = 0
          comments.forEach(comment => {
            const { id, parent_id } = comment
            if (!pushshiftCommentLookup.has(id)) {
              pushshiftCommentLookup.set(id, comment)
              redditIdQueue.push(id)
              count++
              // When viewing the full thread (to prevent false positives), if a parent_id is a comment
              // (not a post/thread) and it's missing from Pushshift, try to get it from Reddit instead.
              if (commentID === undefined && parent_id != threadID && !pushshiftCommentLookup.has(parent_id)) {
                pushshiftCommentLookup.set(parent_id, undefined)  // prevents adding it to the Queue multiple times
                redditIdQueue.push(parent_id)
              }
            }
          })
          while (redditIdQueue.hasFullChunk())
            doRedditComments(redditIdQueue.shiftChunk())
          return count
        }))
      }
      return !this.stopLoading  // causes getPushshiftComments() to exit early if set
    }

    // Download a list of comments by id from Reddit, and process them
    doRedditComments = ids => redditPromises.push(getRedditComments(ids)
      .then(comments => this.compareAndUpdateComments(comments))
      .catch(error => {
        console.timeEnd('Load comments')
        this.props.global.setError(error, error.helpUrl)
        this.stopLoading = true
      })
    )

    // Download comments from Pushshift into the current contig, and process each chunk (above) as it's retrieved
    const after = this.curContig().lastCreated - 1 || this.curContig().firstCreated - 1
    const before = this.nextContig()?.firstCreated + 1
    getPushshiftComments(processPushshiftComments, threadID, newCommentCount, after, before)
      .then(([lastCreatedUtc, curContigLoadedAll]) => {

        // Update the contigs array
        if (curContigLoadedAll) {
          if (before) {
            this.curContig().lastCreated = before - 1
            this.mergeContigs()
          } else {
            this.curContig().lastCreated = lastCreatedUtc
            this.curContig().loadedAllComments = true
          }
        } else
          this.curContig().lastCreated = lastCreatedUtc
        if (this.stopLoading)
          return

        // Finished retrieving comments from Pushshift; wait for processing to finish
        this.props.global.setLoading('Comparing comments...')
        Promise.all(pushshiftPromises).then(lengths => {
          const pushshiftComments = lengths.reduce((a,b) => a+b, 0)
          console.log('Pushshift:', pushshiftComments, 'comments')

          // If Pushshift didn't find the Reddit commentHint, but should have, use Reddit's comment
          if (commentHint && !pushshiftCommentLookup.has(commentHint.id) &&
              commentHint.created_utc >= this.curContig().firstCreated && (
                commentHint.created_utc < this.curContig().lastCreated || curContigLoadedAll
              )) {
            this.useRedditComment(commentHint)
            commentHint = undefined
          }

          // All comments from Pushshift have been processed; wait for Reddit to finish
          while (!redditIdQueue.isEmpty())
            doRedditComments(redditIdQueue.shiftChunk())
          if (this.contextPromise)
            redditPromises.push(this.contextPromise)
          Promise.all(redditPromises).then(lengths => {
            this.contextPromise = undefined
            console.log('Reddit:', lengths.reduce((a,b) => a+b, 0), 'comments')

            if (!this.stopLoading) {
              const loadedAllComments = Boolean(this.curContig().loadedAllComments)
              if (persistent && !loadedAllComments && pushshiftComments <= newCommentCount - pushshiftChunkSize)
                this.getComments(newCommentCount - pushshiftComments, true, commentHint)

              else {
                console.timeEnd('Load comments')
                this.props.global.setSuccess()
                this.setState({
                  pushshiftCommentLookup,
                  removed: this.state.removed,
                  deleted: this.state.deleted,
                  loadedAllComments,
                  loadingComments: false,
                  reloadingComments: false
                })
              }
            }
          })
        })
      })
      .catch(e => {
        console.timeEnd('Load comments')
        this.props.global.setError(e, e.helpUrl)
        if (this.curContig().lastCreated === undefined) {
          this.contigs.splice(this.curContigIdx, 1)
          if (this.contigs.length && this.curContigIdx >= this.contigs.length)
            this.setCurContig(this.contigs.length - 1)
        }
      })
  }

  // Makes a best-effort attempt to retrieve context# ancestors of the current commentID.
  // Returns a Promise which resolves with the number retrieved, or rejects with undefined.
  // (Each code path below must setState({ context }) to avoid an infinite loop.)
  getContext (context) {
    const { params } = this.props.match
    const { pushshiftCommentLookup } = this.state

    // Check how many (if any) ancestors have already been retrieved
    let comment = pushshiftCommentLookup.get(params.commentID), ancestorsFound = 0
    if (comment) {
      while (true) {
        const parent = pushshiftCommentLookup.get(comment.parent_id)
        if (!parent)
          break
        if (parent.parent_id == params.threadID) {
          this.setState({ context })
          return Promise.resolve(0)
        }
        ancestorsFound++
        if (ancestorsFound >= context) {
          this.setState({ context })
          return Promise.resolve(0)
        }
        comment = parent
      }
    }

    // Ask Reddit for a list of ancestors
    return getParentComments(params.threadID, comment?.id || params.commentID, context - ancestorsFound)
      .then(redditComments => {

        // Double-check which comments haven't yet been retrieved from Pushshift, and retreive them
        const ids = redditComments.map(c => c.id).filter(id => !pushshiftCommentLookup.has(id))
        return getCommentsFromIds(ids)
          .then(pushshiftComments => {
            if (ids.length)
              console.log('Pushshift:', pushshiftComments.length, 'comments')
            this.setState({ context })  // Displays the retrieved context
            pushshiftComments.forEach(comment => pushshiftCommentLookup.set(comment.id, comment))
            return this.compareAndUpdateComments(redditComments)
          })
      })
      .catch(e => {
        console.error(e)
        this.setState({ context })
      })
  }

  componentWillUnmount () {
    this.stopLoading = true
  }

  render () {
    const { subreddit, id, author } = this.state.post
    const { commentID } = this.props.match.params
    const reloadingComments = this.state.loadingComments ||
                              this.state.reloadingComments ||
                              this.props.global.state.loadingMoreComments

    const isSingleComment = commentID !== undefined
    const root = isSingleComment ? commentID : id

    return (
      <>
        <Post {...this.state.post} isLocFullPost={!isSingleComment && !this.props.location.hash} />
        <CommentInfo
          total={this.state.pushshiftCommentLookup.size}
          removed={this.state.removed}
          deleted={this.state.deleted}
        />
        <SortBy
          allCommentsFiltered={this.state.allCommentsFiltered}
          loadedAllComments={this.state.loadedAllComments}
          reloadingComments={reloadingComments}
          total={this.state.pushshiftCommentLookup.size}
        />
        {
          (!this.state.loadingComments && root) &&
          <>
            {isSingleComment &&
              <div className='view-rest-of-comment'>
                <div>you are viewing a single comment&apos;s thread.</div><div>
                {this.state.reloadingComments ?
                  <span className='nowrap faux-link'>view the rest of the comments &rarr;</span> :
                  <span className='nowrap'><Link to={() => ({
                    pathname: `/r/${subreddit}/comments/${id}/_/`,
                    hash: '#comment-info',
                    state: {scrollBehavior: 'smooth'}}
                  )}>view the rest of the comments</Link> &rarr;</span>
                }
                {this.state.moreContextAvail && this.state.context < 8 && <>
                  <span className='space' />
                  {this.state.reloadingComments ?
                    <span className='nowrap faux-link'>view more context &rarr;</span> :
                    <span className='nowrap'><Link to={() => ({
                      pathname: `/r/${subreddit}/comments/${id}/_/${commentID}/`,
                      search: `?context=${this.state.context < 4 ? 4 : 8}`}
                    )}>view more context</Link> &rarr;</span>
                  }
                </>}
              </div></div>
            }
            <CommentSection
              root={root}
              context={this.state.context}
              postID={id}
              comments={this.state.pushshiftCommentLookup}
              postAuthor={isDeleted(author) ? null : author}
              commentFilter={this.props.global.state.commentFilter}  // need to explicitly
              commentSort={this.props.global.state.commentSort}      // pass in these props
              reloadingComments={reloadingComments}                  // to ensure React.memo
              total={this.state.pushshiftCommentLookup.size}         // works correctly
              setMoreContextAvail={avail => this.nextMoreContextAvail = avail}
              setAllCommentsFiltered={filtered => this.nextAllCommentsFiltered = filtered}
            />
            <LoadMore
              loadedAllComments={this.state.loadedAllComments}
              reloadingComments={reloadingComments}
              total={this.state.pushshiftCommentLookup.size}
              context={this.state.context}
            />
          </>
        }
        {this.state.showModal &&
          <Modal
            closeModal={() => this.setState({showModal: false})}
            closeModalPermanent={() => {this.setState({showModal: false}); put(dismissModalKey, true)}}
          />
        }
      </>
    )
  }
}

export default connect(Thread)
