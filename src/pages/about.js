import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { connect } from '../state'

const About = props => {
  document.title = 'About Unddit'
  if (props.global.state.statusImage !== undefined) {
    props.global.clearStatus()
  }

  const { hash } = props.location;

  useEffect(() => {
    const id = hash.substr(1)
    if (id)
      document.getElementById(id)?.scrollIntoView({behavior: 'smooth'})
  }, [hash])

  return (
    <div id='main'>
      <div id='main-box'>
        <h2 className='about'>About</h2>
        <p>
          Display
          <b className='removed-text' title='Removed by mods'> removed </b>
          (by mods) and
          <b className='deleted-text' title='Deleted by users'> deleted </b>
          (by users) comments/posts for Reddit.
        </p>
        <p>
          <b>PC Usage</b>: Press Ctrl-Shift-B to view the bookmark bar, and then drag this bookmarklet:
          <a className='bookmarklet' href='javascript:window.open(location.href.replace(/:\/\/([\w-]+.)?(reddit\.com\/r|reveddit\.com\/v)\//i, "://www.unddit.com/r/"), "_blank")'>
            Unddit
          </a>
          to the bar and click it when viewing a Reddit post.
          <br /><br />
          <b>Android Usage</b>: Install <a href='https://play.google.com/store/apps/details?id=com.agreenbhm.reveddit'>this app from the Play store</a>,
          and then, while viewing a post in whichever Reddit app you prefer, click the Share button and select Unddit (which might be beneath Reveddit).
          <br /><br />
          Alternatively you can manually replace the <i>re</i> of <i>reddit</i> in the URL with <i>un</i>.
          <br />
          E.g. <Link to='/r/Bitcoin/comments/7jzpir/'>https://unddit.com/r/Bitcoin/comments/7jzpir/</Link>
        </p>
        <p>
          Created by <a href='https://github.com/JubbeArt/'>Jesper Wrang</a> and
          uses <a href='https://pushshift.io/'>Jason Baumgartner&apos;s service</a> for getting removed comments.
        </p>
        <h2 className='todo'>FAQ</h2>
        <div id='banned' className={!hash || hash == '#banned' ? 'highlighted' : undefined}>
        <b className='question'><Link to='/about#banned'>Q:</Link> Why do new posts all have zero comments?</b>
        <p>
          On May 1st, Reddit banned Pushshift from the Reddit API.
          Since Unddit relies on Pushshift to find removed and deleted comments and posts, any posts made after this time will appear to have zero comments on Unddit.
          The official announcement is <a href='https://old.reddit.com/r/modnews/comments/134tjpe/reddit_data_api_update_changes_to_pushshift_access/' target='_blank' rel='noopener'>available here</a>.
        </p>
        </div>
        <div id='delete' className={hash == '#delete' ? 'highlighted' : undefined}>
        <b className='question'><Link to='/about#delete'>Q:</Link> I posted some sensitive information on Reddit. Can you delete this from your page?</b>
        <p>
          No, I can&apos;t remove anything myself since I am not the not the one storing all the deleted comments.
          This is done by an external service called Pushshift.io.
          If you want something sensitive removed permanently you should follow the <a href='https://www.reddit.com/r/pushshift/comments/pat409/online_removal_request_form_for_removal_requests/'>instructions here</a>.
        </p>
        </div>
        <div id='removeddit' className={hash == '#removeddit' ? 'highlighted' : undefined}>
        <b className='question'><Link to='/about#removeddit'>Q:</Link> Didn&apos;t this site used to be named Removeddit?</b>
        <p>
          The Removeddit site stopped working a short while ago, and this site was made to partially replace it.
          All creddit for the software which makes this site possible goes to the original author, Jesper Wrang.
          Any bugs or problems are due to this site&apos;s operator.
          In particular, Unddit does not currently support browsing subreddits, only specific posts.
        </p>
        </div>
        <div id='how' className={hash == '#how' ? 'highlighted' : undefined}>
        <b className='question'><Link to='/about#how'>Q:</Link> How does it work?</b>
        <p>
          This page is only possible because of the amazing work done by Jason.
          His service <a href='https://pushshift.io/'>Pushshift.io</a> actively listens for new comments on Reddit and stores them in a database.
          Then sites like Unddit and Reveddit can fetch these comments from Pushshift.
          Unddit knows what comments Reddit shows (from Reddit&apos;s API) and what comments should be shown (from Pushshift&apos;s API).
          By comparing the comments from these 2 APIs, it can figure out what has been deleted and removed.
        </p>
        </div>
        <div id='firefox' className={hash == '#firefox' ? 'highlighted' : undefined}>
        <b className='question'><Link to='/about#firefox'>Q:</Link> Why doesn&apos;t it work in Firefox?</b>
        <p>
          If you have enabled Strict Enhanced Tracking Protection in Firefox, this will prevent Unddit from contacting Reddit&apos;s API.
          Luckily there is an easy workaround.
          Click on the shield symbol on the left side of the address bar, and then switch off Enhanced Tracking Protection for this site.
          It will still be enabled for other sites.
        </p>
        </div>
        <div id='edge' className={hash == '#edge' ? 'highlighted' : undefined}>
        <b className='question'><Link to='/about#edge'>Q:</Link> Why doesn&apos;t it work in Edge?</b>
        <p>
          If you have enabled Strict Tracking Protection in Edge, this will prevent Unddit from contacting Reddit&apos;s API.
          Luckily there is an easy workaround.
          Click on the padlock symbol on the left side of the address bar, and then switch off Tracking Protection for this site.
          It will still be enabled for other sites.
        </p>
        </div>
        <div id='psdown' className={hash == '#psdown' ? 'highlighted' : undefined}>
        <b className='question'><Link to='/about#psdown'>Q:</Link> Is Unddit/Pushshift down?</b>
        <p>
          Occasionally, Pushshift (the service used by Unddit) goes offline for a while.
          This can result in &ldquo;Could not get removed post/comments&rdquo; errors on Unddit.
          To check its status, click <a href='https://api.pushshift.io/reddit/search/comment?limit=1&filter=body&since=1659370272&until=1659370273&link_id=1957745423'>this direct link to Pushshift</a>.
          You should either get a message saying that &ldquo;Pushshift is UP!&rdquo; within the first few words of the message, or an error.
        </p>
        </div>
        <div id='difference' className={hash == '#difference' ? 'highlighted' : undefined}>
        <b className='question'><Link to='/about#difference'>Q:</Link> What&apos;s the difference between Ceddit and Removeddit/Unddit?</b>
        <p>
          Not much. Removeddit was created as a temporary replacement for Ceddit, at a time when Ceddit didn&apos;t work.
          Jesper thought this was necessary since he used Ceddit more then Reddit itself.
          Months later Ceddit was fixed, but he didn&apos;t see any reason to remove what he had built.
          Today both sites live side by side and strive for the same goal.
        </p>
        <div>
          There are some minor differences in them though:
          <ul>
            <li>
              Ceddit respects user-made deletions while Removeddit does not. This decision was made early on and I feel like it&apos;s too late to change now.
              If I had created Removeddit today I might had thought more about what was right here.
            </li>
            <li>
              Removeddit usually loads faster since it uses a slightly different algorithm for detecting removed comments.
              Removeddit also uses significantly less JavaScript on the page which also should make the page load faster.
            </li>
            <li>
              Ceddit provides user lookup while Removeddit doesn&apos;t.
            </li>
          </ul>
        </div>
        </div>

        <h2 className='contact'>Links</h2>
        <p>
          <a href='https://github.com/gurnec/removeddit'>Code on Github.</a>
        </p>
      </div>
    </div>
  )
}

export default connect(About)
