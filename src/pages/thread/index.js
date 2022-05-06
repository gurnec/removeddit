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
  chunkSize as pushshiftChunkSize
} from '../../api/pushshift'
import { isDeleted, isRemoved, sleep } from '../../utils'
import { connect, constrainMaxComments } from '../../state'
import Post from '../common/Post'
import CommentSection from './CommentSection'
import SortBy from './SortBy'
import CommentInfo from './CommentInfo'
import LoadMore from './LoadMore'

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

class Thread extends React.Component {
  // For state.context:
  //   undefined - ignore the context query parameter
  //   an int - the current context; will be updated if query param changes
  state = {
    post: {},
    pushshiftCommentLookup: new Map(),
    removed: 0,
    deleted: 0,
    context: undefined,
    moreContextAvail: true,
    allCommentsFiltered: false,
    loadedAllComments: false,
    loadingComments: true,
    reloadingComments: false
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
      this.state.removed++
      commentHint.removed = true
    } else if (isDeleted(comment.body)) {
      this.state.deleted++
      commentHint.deleted = true
    }
    this.state.pushshiftCommentLookup.set(comment.id, comment)
  }

  commentIdAttempts = new Set()  // keeps track of attempts to load permalinks to avoid reattempts

  componentDidMount () {
    const { subreddit, threadID, commentID } = this.props.match.params
    this.state.post = { subreddit, id: threadID }
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
    const searchParams = new URLSearchParams(this.props.location.search)
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
            this.state.loadingComments = false
            console.error('link_id mismatch:', comment)
            return
          }
          this.contigs.unshift({firstCreated: comment?.created_utc || EARLIEST_CREATED})
          if (parseInt(searchParams.get('context')) > 0) {
            this.getComments(maxComments, false, comment, false)
              .then(() => this.setState({ context: 0 }))  // initial state; will be updated in componentDidUpdate()
          } else {
            this.getComments(maxComments, false, comment)
            this.state.context = 0
          }
        })
        .catch(() => {
          this.contigs.unshift({firstCreated: EARLIEST_CREATED})
          this.getComments(maxComments)
        })

      // Set the scroll location to just below the post if not already set (only with permalinks)
      if (!this.props.location.hash)
        this.props.location.hash = '#comment-info'
    }

    if (this.props.location.hash)
      this.props.location.state = {scrollBehavior: 'smooth'}
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
    let { loadingComments, pushshiftCommentLookup } = this.state
    const { commentID } = this.props.match.params
    const { location } = this.props
    const requestedContext = commentID ? parseInt((new URLSearchParams(location.search)).get('context')) : 0

    // If the max-to-download Reload button or 'load more comments' was clicked
    const { loadingMoreComments } = this.props.global.state
    if (loadingMoreComments) {
      this.props.global.state.loadingMoreComments = 0
      this.setState({reloadingComments: true})
      this.props.global.setLoading('Loading comments...')
      console.time('Load comments')
      this.updateCurContig()
      this.getComments(loadingMoreComments, true)

    // If we're loading a comment tree we haven't downloaded yet
    // TODO: when switching to an existing contig that's been downloaded via the
    //       "additional context" code below (which only downloads 100 comments
    //       per contig), this code branch should download an additional
    //       global.maxComments-100 comments, in persistant mode, to the contig.
    } else if (!loadingComments && !this.state.reloadingComments && !this.updateCurContig()) {

      // If we haven't downloaded from the earliest available yet (not a permalink)
      if (commentID === undefined) {
        loadingComments = true
        this.setState({loadingComments})
        this.props.global.setLoading('Loading comments...')
        console.time('Load comments')
        this.contigs.unshift({firstCreated: EARLIEST_CREATED})
        this.setCurContig(0)
        this.getComments(this.props.global.maxComments)

      // If we haven't downloaded this permalink yet
      } else if (!this.commentIdAttempts.has(commentID)) {
        this.commentIdAttempts.add(commentID)
        this.setState({reloadingComments: true, context: 0})
        this.props.global.setLoading('Loading comments...')
        console.time('Load comments')
        let createdUtcNotFound  // true if Reddit doesn't have the comment's created_utc
        getRedditComments([commentID])
          .then(([comment]) => {
            const created_utc = comment?.created_utc
            if (created_utc > EARLIEST_CREATED) {
              let insertBefore = this.contigs.findIndex(contig => created_utc < contig.firstCreated)
              if (insertBefore == -1)
                insertBefore = this.contigs.length

              // If comment isn't inside an existing contig, create a new one and start downloading
              // TODO: see the TODO just above - add a flag to the contig to
              //       indicate that the download was for only 100 comments?
              if (insertBefore == 0 || created_utc >= this.contigs[insertBefore - 1].lastCreated) {
                this.contigs.splice(insertBefore, 0, {firstCreated: created_utc})
                this.setCurContig(insertBefore)
                this.fullnamesToShortIDs(comment)
                this.getComments(this.props.global.maxComments, false, comment)

              // Otherwise an earlier attempt to download it from Pushshift turned up nothing,
              } else {
                this.fullnamesToShortIDs(comment)
                this.useRedditComment(comment)       // so use the Reddit comment instead
                this.setCurContig(insertBefore - 1)  // (this was the failed earlier attempt)
                console.timeEnd('Load comments')
                this.props.global.setSuccess()
                this.setState({loadingComments: false, reloadingComments: false})
              }
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

    // If additional context needs to be downloaded
    } else if (requestedContext > this.state.context) {
      this.state.context = requestedContext
      if (!this.state.loadingComments) {
        this.setState({reloadingComments: true})
        this.props.global.setLoading('Loading comments...')
        console.time('Load comments')
      }
      const origContigIdx = this.curContigIdx
      getParentComments(this.props.match.params.threadID, commentID, requestedContext)
        .then(async comments => {
          const lastComment = comments[comments.length - 1]
          for (let comment of comments) {
            if (!pushshiftCommentLookup.has(comment.id)) {
              this.redditIdsToPushshift(comment)
              const created_utc = comment.created_utc
              const insertBefore = this.contigs.findIndex(contig => created_utc < contig.firstCreated)

              // If comment isn't inside an existing contig, create a new one and start downloading
              if (insertBefore == 0 || created_utc >= this.contigs[insertBefore - 1].lastCreated) {
                this.contigs.splice(insertBefore, 0, {firstCreated: created_utc})
                this.curContigIdx = insertBefore
                await this.getComments(pushshiftChunkSize, false, comment, comment === lastComment)
                if (this.stopLoading)
                  break

              // Otherwise an earlier attempt to download it from Pushshift turned up nothing,
              } else {
                this.useRedditComment(comment)  // so use the Reddit comment instead
                if (comment === lastComment)
                  this.getComments(0)  // wait for pending Reddit comments & update state
              }

            } else if (comment === lastComment)
              this.getComments(0)  // wait for pending Reddit comments & update state
          }
        })
//        // TODO: Error handling:
//        //       1) just download global.maxComments into an existing or new contig?
//        //       2) query the parent_id chain from Pushshift (one request per parent)?
//        .catch(() => {
//          // ...
//          this.getComments(this.props.global.maxComments)
//        })
        .finally(() => this.curContigIdx = origContigIdx)
    }

    if (!requestedContext && this.state.context || requestedContext < this.state.context)
      this.setState({context: requestedContext || 0})

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

  // Before calling, either create (and set to current) a new contig to begin downloading
  // after a new time, or set the current contig to begin adding to the end of that contig.
  //   persistent: if true, will try to continue downloading after the current contig has
  //               been completed and merged with the next contig.
  //  commentHint: a Reddit comment for use if Pushshift is missing that same comment;
  //               its ids must have already been updated by fullnamesToShortIDs()
  //     setState: if true, will call setState to update the page once completed;
  //               note that if false, persistent is ignored and treated as false
  // Returns: a Promise which resolves after comments have been retrieved and processed
  //          from Pushshift (but possibly before they've been retrieved from Reddit)
  redditIdQueue = new ChunkedQueue(redditChunkSize)
  redditPromises = []
  getComments (newCommentCount, persistent = false, commentHint = undefined, setState = true) {
    const { threadID, commentID } = this.props.match.params
    const { pushshiftCommentLookup } = this.state
    const pushshiftPromises = []
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
              this.redditIdQueue.push(id)
              count++
              // When viewing the full thread (to prevent false positives), if a parent_id is a comment
              // (not a post/thread) and it's missing from Pushshift, try to get it from Reddit instead.
              if (commentID === undefined && parent_id != threadID && !pushshiftCommentLookup.has(parent_id)) {
                pushshiftCommentLookup.set(parent_id, undefined)  // prevents adding it to the Queue multiple times
                this.redditIdQueue.push(parent_id)
              }
            }
          })
          while (this.redditIdQueue.hasFullChunk())
            doRedditComments(this.redditIdQueue.shiftChunk())
          return count
        }))
      }
      return !this.stopLoading  // causes getPushshiftComments() to exit early if set
    }

    // Download a list of comments by id from Reddit, and process them
    doRedditComments = ids => this.redditPromises.push(getRedditComments(ids)
      .then(comments => {
        let removed = 0, deleted = 0
        comments.forEach(comment => {
          let pushshiftComment = pushshiftCommentLookup.get(comment.id)
          if (pushshiftComment === undefined) {
            // When a parent comment is missing from pushshift, use the reddit comment instead
            pushshiftComment = this.redditIdsToPushshift(comment)
            pushshiftCommentLookup.set(comment.id, pushshiftComment)
          } else {
            // Replace pushshift score with reddit (it's usually more accurate)
            pushshiftComment.score = comment.score
          }

          // Check what is removed / deleted according to reddit
          if (isRemoved(comment.body)) {
            removed++
            pushshiftComment.removed = true
          } else if (isDeleted(comment.body)) {
            deleted++
            pushshiftComment.deleted = true
          } else if (pushshiftComment !== comment) {
            if (isRemoved(pushshiftComment.body)) {
              // If it's deleted in pushshift, but later restored by a mod, use the restored
              this.redditIdsToPushshift(comment)
              pushshiftCommentLookup.set(comment.id, comment)
            } else if (pushshiftComment.body != comment.body) {
              pushshiftComment.edited_body = comment.body
              pushshiftComment.edited = comment.edited
            }
          }
        })
        this.setState({ removed: this.state.removed + removed, deleted: this.state.deleted + deleted })
        return comments.length
      })
      .catch(error => {
        console.timeEnd('Load comments')
        this.props.global.setError(error, error.helpUrl)
        this.stopLoading = true
      })
    )

    // Download comments from Pushshift into the current contig, and process each chunk (above) as it's retrieved
    const after = this.curContig().lastCreated - 1 || this.curContig().firstCreated - 1
    const before = this.nextContig()?.firstCreated + 1
    return (newCommentCount ?
        getPushshiftComments(processPushshiftComments, threadID, newCommentCount, after, before) :
        Promise.resolve([undefined, false])
      )
      .then(([lastCreatedUtc, curContigLoadedAll]) => {

        // Update the contigs array
        if (newCommentCount) {
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
        }

        // Finished retrieving comments from Pushshift; wait for processing to finish
        if (setState)
          this.props.global.setLoading('Comparing comments...')
        return Promise.all(pushshiftPromises).then(lengths => {  // this is the promise that's returned
          let pushshiftComments
          if (newCommentCount) {
            pushshiftComments = lengths.reduce((a,b) => a+b, 0)
            console.log('Pushshift:', pushshiftComments, 'comments')
          }

          // If Pushshift didn't find the Reddit commentHint, but should have, use Reddit's comment
          if (commentHint && !pushshiftCommentLookup.has(commentHint.id) &&
              commentHint.created_utc >= this.curContig().firstCreated && (
                commentHint.created_utc < this.curContig().lastCreated || curContigLoadedAll
              )) {
            this.useRedditComment(commentHint)
            commentHint = undefined
          }

          // All comments from Pushshift have been processed; wait for Reddit to finish
          if (setState) {
            while (!this.redditIdQueue.isEmpty())
              doRedditComments(this.redditIdQueue.shiftChunk())
            Promise.all(this.redditPromises).then(lengths => {
              console.log('Reddit:', lengths.reduce((a,b) => a+b, 0), 'comments')
              this.redditPromises.splice(0)

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
          }
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
                <div>you are viewing a single comment's thread.</div><div>
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
            />
          </>
        }
      </>
    )
  }
}

export default connect(Thread)
