import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { prettyScore, prettyDate, prettyTimeDiff, exactDateTime, parse, redditThumbnails,
         isDeleted, isRemoved, editedModes, editedTitles } from '../../utils'
import { Diff } from '@ali-tas/htmldiff-js'

const hasOwnProperty = Object.prototype.hasOwnProperty

const Post = (props) => {
  if (!props.title) {
    const permalink = `/r/${props.subreddit}/comments/${props.id}/`
    return <div className={props.removed ? 'thread removed' : 'thread'} key={props.removed ? 'post-removed' : 'post-empty'}>
      <div className="thread-score-box">
        <div className="vote upvote" />
        <div className="thread-score">?</div>
        <div className="vote downvote" />
      </div>
      <Link className="thumbnail thumbnail-default" to={permalink} replace={props.isLocFullPost} />
      <div className="thread-content">
        <Link className="thread-title" to={permalink} replace={props.isLocFullPost}>
          {props.removed ? '[removed too quickly to be archived]' : '...'}
        </Link>
        <div className='thread-info'>&nbsp;</div>
        <div className="total-comments">
          <a href={`https://www.reddit.com${permalink}`}>reddit</a>&nbsp;
          <a href={`https://www.reveddit.com${permalink}`}>reveddit</a>
        </div>
      </div>
    </div>
  }

  let url = new URL(props.url, 'https://www.reddit.com')
  if ((url.hostname.endsWith('.reddit.com') || url.hostname == 'reddit.com') &&
       url.pathname.match(/^\/(?:r|user)\/[^/]+\/comments\/./)) {
    url.protocol = document.location.protocol
    url.host     = document.location.host
  }
  const isUrlThisPost = url.origin == document.location.origin &&
    (new RegExp(`/(?:r|user)/[^/]+/comments/${props.id}\\b`)).test(url.pathname)
  if (isUrlThisPost)
    url = url.href.substring(url.origin.length)

  const userLink = isDeleted(props.author) ? undefined : `https://www.reddit.com/user/${props.author}`

  let thumbnail
  const thumbnailWidth = props.thumbnail_width ? props.thumbnail_width * 0.5 : 70
  const thumbnailHeight = props.thumbnail_height ? props.thumbnail_height * 0.5 : 70

  if (redditThumbnails.includes(props.thumbnail)) {
    thumbnail = React.createElement(isUrlThisPost ? Link : 'a', {
      [isUrlThisPost ? 'to' : 'href']: url,
      replace: isUrlThisPost ? props.isLocFullPost : undefined,
      className: `thumbnail thumbnail-${props.thumbnail}`
    })
  } else if (props.thumbnail !== '') {
    thumbnail = React.createElement(isUrlThisPost ? Link : 'a', {
      [isUrlThisPost ? 'to' : 'href']: url,
      replace: isUrlThisPost ? props.isLocFullPost : undefined
    }, <img className='thumbnail' src={props.thumbnail.replaceAll('&amp;', '&')} width={thumbnailWidth} height={thumbnailHeight} alt='Thumbnail' />)
  }

  const innerHTML = Array(editedModes.length)
  if (props.removed && isRemoved(props.selftext)) {
    if (!hasOwnProperty.call(props, 'retrieved_utc') && !hasOwnProperty.call(props, 'retrieved_on') || !hasOwnProperty.call(props, 'created_utc')) {
      innerHTML[editedModes.dfault] = '<p>[removed too quickly to be archived]</p>'
    } else {
      const retrieved = hasOwnProperty.call(props, 'retrieved_utc') ? props.retrieved_utc : props.retrieved_on;
      innerHTML[editedModes.dfault] = `<p>[removed within ${prettyTimeDiff(retrieved - props.created_utc)}]</p>`
    }
  } else if (props.selftext && (props.is_self || !isDeleted(props.selftext))) {
    if (hasOwnProperty.call(props, 'edited_selftext')) {
      innerHTML[editedModes.orig]   = parse(props.selftext)
      innerHTML[editedModes.edited] = parse(props.edited_selftext)
      innerHTML[editedModes.dfault] = Diff.execute(innerHTML[editedModes.orig], innerHTML[editedModes.edited])
    } else
      innerHTML[editedModes.dfault] = parse(props.selftext)
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [editedMode, setEditedMode] = useState(editedModes.dfault)

  const totalComments = <div className='total-comments'>
    <Link to={props.permalink} replace={props.isLocFullPost}>{props.num_comments}&nbsp;comments</Link>&nbsp;
    <a href={`https://www.reddit.com${props.permalink}`}>reddit</a>&nbsp;
    <a href={`https://www.reveddit.com${props.permalink}`}>reveddit</a>
    {hasOwnProperty.call(props, 'edited_selftext') &&
      <a onClick=  {() => setEditedMode((editedMode + 1) % editedModes.length)}
         onKeyDown={e => e.key == 'Enter' && setEditedMode((editedMode + 1) % editedModes.length)}
         tabIndex= {0}
         title=    {editedTitles[editedMode]}
      >*edited</a>}
  </div>

  return <div className={props.removed ? 'removed' : props.deleted ? 'deleted' : undefined} key="post-found">
    <div className='thread'>
      {props.position &&
        <span className='post-rank'>{props.position}</span>}
      <div className='thread-score-box'>
        <div className='vote upvote' />
        <div className='thread-score'>{prettyScore(props.score)}</div>
        <div className='vote downvote' />
      </div>
      {thumbnail}
      <div className='thread-content'>
        { React.createElement(isUrlThisPost ? Link : 'a', {
          [isUrlThisPost ? 'to' : 'href']: url,
          replace: isUrlThisPost ? props.isLocFullPost : undefined,
          className:'thread-title'
        }, props.title) }
        {props.link_flair_text &&
          <span className='link-flair'>{props.link_flair_text}</span>
        }
        <span className='domain'>({props.domain})</span>
        <div className='thread-info'>
          submitted <span className='thread-time' title={exactDateTime(props.created_utc)}>{prettyDate(props.created_utc)}</span>
          {props.edited &&
            <span className='thread-time' title={exactDateTime(props.edited)}> * (last edited {prettyDate(props.edited)})</span>
          }
          &nbsp;by <a className='thread-author author' href={userLink}>{props.author}</a> to /r/{props.subreddit}
        </div>
        {innerHTML[editedModes.dfault] === undefined && totalComments}
      </div>
    </div>
    {innerHTML[editedModes.dfault] !== undefined &&
      <div className='thread-content'>
        <div className='thread-selftext user-text' dangerouslySetInnerHTML={{ __html: innerHTML[editedMode] }} />
        {totalComments}
      </div>
    }
  </div>
}

export default Post
