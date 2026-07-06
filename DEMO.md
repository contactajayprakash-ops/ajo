# Demo script (~3 minutes)

The judges watch a lot of these. Lead with the problem and the live moment, not a tour of the settings screen. Have two browser windows open side by side before you hit record — one is you (Amara, the admin), one is a second member (Kwame). Log both in ahead of time so you're not typing passwords on camera.

Target length 3:00–3:30. Under the 5-minute cap on purpose.

---

**0:00 – 0:25 · The problem**

Talk over the landing page.

> "This is how a huge share of West Africa saves — ajo, esusu, susu. A group puts in a fixed amount every week, and each week one person takes the whole pot. It works, until you realize someone has to hold everyone's cash, track who paid, and be trusted not to run. That trust bottleneck is what keeps these circles small. Ajo fixes it."

**0:25 – 0:50 · Start a circle**

On Amara's window, create a circle: "Market Women Weekly", 5,000 naira, weekly, 4 seats. Point at the invite code.

> "I start a circle — amount, how often, how many people. I get a code to share."

**0:50 – 1:15 · Someone joins**

Paste the code into Kwame's window, join.

> "Kwame joins with the code and gets a spot in the rotation. Everybody can see the running order — no arguments about whose turn it is, because it's fixed when the circle starts."

Back on Amara's window, hit **Start the circle**.

**1:15 – 2:00 · The live pot (the moment)**

Arrange both windows so the pot is visible in each. On Kwame's window, pay in.

> "Now watch both screens. Kwame pays in on his phone…"

Pause. Let the pot count up **on Amara's screen** without her touching anything.

> "…and it moves on mine. No refresh. Same pot, everyone watching it fill in real time. That's the whole feeling of a savings circle, except nobody's holding the cash."

Pay in on Amara's window too. Point at the feed filling in and the ticks next to each member.

**2:00 – 2:35 · Payout and rotation**

As admin, release the pot.

> "Once everyone's in, I release the pot to whoever's up first. It goes out, the cycle ticks over, and next week it's the next person. Every payment and payout is in the feed with a timestamp — nothing hidden."

Show the recipient highlighted and the cycle advancing.

**2:35 – 3:10 · How it's built**

Cut to the repo or just talk over the app.

> "There's no backend server here that I wrote. The whole thing runs on Sub0 — the auth, the contribution flow, the payout rotation, and those live updates are all declared as JSON specs, no controllers. It deploys on LingoQL next to a static frontend with no build step. Idea to a live, real-time product, with basically no infrastructure. That's the point."

End on the live pot, not a logo.

---

## Recording notes

- Do a dry run first. The one thing that has to land clean is the pot moving on the *other* screen — rehearse the window layout so both pots are on camera at once.
- Seed a little history before recording (a couple of contributions from earlier) so the feed isn't empty when you open the circle.
- If you're screen-recording two windows, half-size them side by side rather than switching tabs — the split screen is what sells "real time".
- Keep talking over the clicks. Dead air while a form submits reads as slow.
