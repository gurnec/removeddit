import React from 'react'
import Comment from './Comment'
import {sort, filter} from '../../state'
import {
  topSort, bottomSort, newSort, oldSort,
  showRemovedAndDeleted, showRemoved, showDeleted
} from '../../utils'

const unflatten = (commentMap, rootID, context, postID) => {
  const commentTree = []

  commentMap.forEach(comment => {
    if (comment)
      comment.replies = []
  })

  if (rootID == postID) {
    commentMap.forEach(comment => {
      if (!comment)
        return
      const parentID = comment.parent_id
      if (parentID == postID)
        commentTree.push(comment)
      else {
        const parentComment = commentMap.get(comment.parent_id)
        if (parentComment)
          parentComment.replies.push(comment)
        else
          console.warn('Missing parent ID:', parentID, 'for comment', comment)
      }
    })
    return commentTree

  } else {
    const missingRootReplies = []
    commentMap.forEach(comment => {
      if (!comment)
        return
      const parentID = comment.parent_id
      const parentComment = commentMap.get(parentID)
      if (parentComment)
        parentComment.replies.push(comment)
      else if (parentID == rootID)
        missingRootReplies.push(comment)
    })
    let rootComment = commentMap.get(rootID)
    if (!rootComment) {
      const anyComment = commentMap.values().next().value
      if (!anyComment)
        return []
      rootComment = {
        id: rootID,
        link_id:   anyComment.link_id,
        parent_id: anyComment.link_id,
        subreddit: anyComment.subreddit,
        score:   '?',
        body:    '...',
        replies: missingRootReplies
      }
    }
    let newRoot
    while (context && rootComment.parent_id && (newRoot = commentMap.get(rootComment.parent_id))) {
      newRoot.replies = [rootComment]
      rootComment = newRoot
      context--
    }
    return [rootComment]
  }
}

const sortCommentTree = (comments, sortFunction) => {
  comments.sort(sortFunction)

  comments.forEach(comment => {
    if (comment.replies.length > 0) {
      sortCommentTree(comment.replies, sortFunction)
    }
  })
}

const filterCommentTree = (comments, filterFunction) => {
  if (comments.length === 0) {
    return false
  }

  let hasOkComment = false

  // Reverse for loop since we are removing stuff
  for (let i = comments.length - 1; i >= 0; i--) {
    const comment = comments[i]
    const isRepliesOk = filterCommentTree(comment.replies, filterFunction)
    const isCommentOk = filterFunction(comment)

    if (!isRepliesOk && !isCommentOk) {
      comments.splice(i, 1)
    } else {
      hasOkComment = true
    }
  }

  return hasOkComment
}

let commentTree, lastTotal, lastRoot, lastContext, lastFilter, lastSort, lengthBeforeFiltering

const commentSection = (props) => {
  console.time('Build comment tree')
  const {total, root, context, commentFilter, commentSort} = props

  const needsRebuild = !(total === lastTotal && root === lastRoot && context === lastContext && (
    commentFilter === lastFilter ||
    lastFilter    === filter.all ||
    lastFilter    === filter.removedDeleted && (
      commentFilter === filter.removed ||
      commentFilter === filter.deleted
    )
  ))
  if (needsRebuild) {
    commentTree = unflatten(props.comments, root, context, props.postID)
    lengthBeforeFiltering = commentTree.length
  }

  if (needsRebuild || commentFilter !== lastFilter) {
    if (commentFilter === filter.removedDeleted) {
      filterCommentTree(commentTree, showRemovedAndDeleted)
    } else if (commentFilter === filter.removed) {
      filterCommentTree(commentTree, showRemoved)
    } else if (commentFilter === filter.deleted) {
      filterCommentTree(commentTree, showDeleted)
    }
  }

  if (needsRebuild || commentSort !== lastSort) {
    if (commentSort === sort.top) {
      sortCommentTree(commentTree, topSort)
    } else if (commentSort === sort.bottom) {
      sortCommentTree(commentTree, bottomSort)
    } else if (commentSort === sort.new) {
      sortCommentTree(commentTree, newSort)
    } else if (commentSort === sort.old) {
      sortCommentTree(commentTree, oldSort)
    }
  }

  lastTotal  = total
  lastRoot   = root
  lastFilter = commentFilter
  lastSort   = commentSort
  console.timeEnd('Build comment tree')

  props.setMoreContextAvail(commentTree.length > 0 && commentTree[0].parent_id != commentTree[0].link_id)
  props.setAllCommentsFiltered(commentTree.length == 0 && lengthBeforeFiltering > 0)

  console.time('Build html tree')
  const htmlTree = (
    commentTree.length !== 0
      ? commentTree.map(comment => (
        <Comment
          key={comment.id}
          {...comment}
          depth={0}
          postAuthor={props.postAuthor}
          highlightedID={context ? root : null}
        />
      ))
      : <p>No comments found</p>
  )
  console.timeEnd('Build html tree')
  return htmlTree
}

const areEqual = (prevProps, nextProps) => {
  if (prevProps.commentFilter !== nextProps.commentFilter ||
      prevProps.commentSort   !== nextProps.commentSort   ||
      prevProps.context       !== nextProps.context       ||
      prevProps.root          !== nextProps.root)
    return false
  if (nextProps.reloadingComments)
    return true
  return prevProps.total      === nextProps.total &&
         prevProps.postAuthor === nextProps.postAuthor
}

export default React.memo(commentSection, areEqual)
