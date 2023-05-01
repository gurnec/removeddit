import React from 'react'
import ReactDom from "react-dom"

const Modal = props => {
  return <div className='modal'>
    <div className='modal-content'>
      <div className='modal-header'>
        <span className='close' onClick={() => props.closeModal()}>&times;</span>
        <h2>Pushshift Ban</h2>
      </div>
      <div className='modal-body'>
        <p>
          On May 1st, Reddit banned Pushshift from the Reddit API.
          Since Unddit relies on Pushshift to find removed and deleted comments and posts, any posts made after this time will appear to have zero comments on Unddit.
          The official announcement is <a href='https://old.reddit.com/r/modnews/comments/134tjpe/reddit_data_api_update_changes_to_pushshift_access/' target='_blank' rel='noopener'>available here</a>.
        </p>
        <input onClick={() => props.closeModalPermanent()} type='button' value='Do not show this message again' />
      </div>
    </div>
  </div>
}

export default Modal
