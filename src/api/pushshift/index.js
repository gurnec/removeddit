import { fetchJson } from '../../utils'
import { toBase10, toBase36 } from '../../utils'

const postURL    = 'https://api.pushshift.io/reddit/submission/search/?ids='
const commentURL = 'https://elastic.pushshift.io/rc/comments/_search?source='

export const getPost = threadID =>
  fetchJson(`${postURL}${threadID}`)
    .then(({ data }) => data[0])
    .catch(error => {
      console.error('pushshift.getPost: ' + error)
      throw new Error('Could not get removed post')
    })

export const getComments = (threadID, maxComments) => {
  const elasticQuery = {
    query: {
      term: {
        link_id: toBase10(threadID)
      }
    },
    sort: [ 'created_utc' ],
    size: maxComments,
    _source: [
      'author', 'body', 'created_utc', 'parent_id', 'score', 'subreddit', 'link_id', 'retrieved_on', 'retrieved_utc'
    ]
  }

  return fetchJson(commentURL + JSON.stringify(elasticQuery))
    .then(response => {
      const comments = response.hits.hits
      return comments.map(comment => {
        comment._source.id = toBase36(comment._id)
        comment._source.link_id = toBase36(comment._source.link_id)

        // Missing parent id === direct reply to thread
        if (!comment._source.parent_id) {
          comment._source.parent_id = threadID
        } else {
          comment._source.parent_id = toBase36(comment._source.parent_id)
        }

        return comment._source
      })
    })
    .catch(error => {
      console.error('pushshift.getComments: ' + error)
      throw new Error('Could not get removed comments')
    })
}
