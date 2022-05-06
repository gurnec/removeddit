import React, { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { prettyScore, prettyDate, prettyTimeDiff, exactDateTime, parse, isRemoved } from '../../utils'

const Comment = (props) => {
  let commentStyle = 'comment '

  if (props.removed) {
    commentStyle += 'removed'
  } else if (props.deleted) {
    commentStyle += 'deleted'
  } else {
    commentStyle += props.depth % 2 === 0 ? 'comment-even' : 'comment-odd'
  }
  if (props.id == props.highlightedID) {
    commentStyle += ' highlighted'
  }

  let innerHTML, editedInnerHTML;
  if (props.removed && isRemoved(props.body)) {
    if (!props.hasOwnProperty('retrieved_utc') && !props.hasOwnProperty('retrieved_on') || !props.hasOwnProperty('created_utc')) {
      innerHTML = '<p>[removed too quickly to be archived]</p>'
    } else if (props.created_utc < 1627776000) {  // Aug 1 2021
      const retrieved = props.hasOwnProperty('retrieved_utc') ? props.retrieved_utc : props.retrieved_on;
      innerHTML = `<p>[removed within ${prettyTimeDiff(retrieved - props.created_utc)}]</p>`
    }
    // After around Aug 1 2021, Pushshift began updating comments from Reddit after around
    // 24-48 hours, including removing(?) comments that were removed from Reddit. The presence
    // of either retrieved_utc or retrieved_on can currently be used to test for this behaviour.
    else if (props.hasOwnProperty('retrieved_utc')) {
      innerHTML = `<p>[removed within ${prettyTimeDiff(props.retrieved_utc - props.created_utc)}]</p>`
    } else {
      innerHTML = `<p>[either removed too quickly, or <a href='https://www.reddit.com/r/pushshift/comments/pgzdav/the_api_now_appears_to_rewrite_nearly_all/'>removed(?) from archive</a> after ${prettyTimeDiff(props.retrieved_on - props.created_utc, true)}]</p>`
    }
  } else {
    innerHTML = parse(props.body)
    if (props.hasOwnProperty('edited_body'))
      editedInnerHTML = parse(props.edited_body)
  }

  const [collapsed, setCollapsed] = useState(false)
  const [showEdited, setShowEdited] = useState(false)
  const permalink = `/r/${props.subreddit}/comments/${props.link_id}/_/${props.id}/`
  const parentlink = props.parent_id == props.link_id ? undefined : (
    props.depth == 0 ?
      <NavLink
        to={`/r/${props.subreddit}/comments/${props.link_id}/_/${props.parent_id}/`}
        activeClassName='wait'
      >parent</NavLink>
    :
      // Use a function, not just an object--state is recreated and scrollBehavior is always initialized
      <Link to={() => ({hash: `#${props.parent_id}`, state: {scrollBehavior: 'smooth'}})}>parent</Link>
  )

  return (
    <div id={props.id} className={commentStyle}>
      <div className={collapsed ? 'comment-head comment-collapsed' : 'comment-head'}>
        <a onClick=  {() => setCollapsed(!collapsed)}
           onKeyDown={e => e.key == "Enter" && setCollapsed(!collapsed)}
           tabIndex= {0}
           className='comment-collapse'>[{collapsed ? '+' : '\u2212'}]</a>
        <span className='space' />
        <a
          href={props.author !== '[deleted]' ? `https://www.reddit.com/user/${props.author}` : undefined}
          className={props.author === props.postAuthor ? 'author comment-author comment-poster' : 'author comment-author'}
        >
          {props.author}
          {props.deleted && ' (deleted by user)'}
        </a>
        <span className='space' />
        <span className='comment-score'>{prettyScore(props.score)} point{(props.score !== 1) && 's'}</span>
        <span className='space' />
        {props.created_utc &&
          <span className='comment-time' title={exactDateTime(props.created_utc)}>{prettyDate(props.created_utc)}</span>}
        {(props.hasOwnProperty('edited_body') || props.edited) &&
          <span className='comment-time' title={props.edited ? exactDateTime(props.edited) : 'within 3 minutes'}
          >* (last edited {prettyDate(props.edited ? props.edited : props.created_utc)})</span>}
      </div>
      <div style={collapsed ? {display: 'none'} : {}}>
        <div className='comment-body' dangerouslySetInnerHTML={{ __html: showEdited ? editedInnerHTML : innerHTML }} />
        <div className='comment-links'>
          <Link to={() => ({pathname: permalink, hash: '#comment-info', state: {scrollBehavior: 'auto'}})}>permalink</Link>
          <a href={`https://www.reddit.com${permalink}`}>reddit</a>
          <a href={`https://www.reveddit.com${permalink}`}>reveddit</a>
          {parentlink}
          {props.hasOwnProperty('edited_body') &&
            <a onClick=  {() => setShowEdited(!showEdited)}
               onKeyDown={e => e.key == "Enter" && setShowEdited(!showEdited)}
               tabIndex= {0}
               title=    {showEdited ? 'The most recent version is shown; click to show the earliest archived' : 'The earliest archived version is shown; click to show the most recent'}
            >*edited</a>}
        </div>
        <div>
          {props.replies.map(comment => (
            <Comment
              key={comment.id}
              {...comment}
              depth={props.depth + 1}
              postAuthor={props.postAuthor}
              highlightedID={props.highlightedID}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default Comment
