import { Resend } from 'resend';
import admin from 'firebase-admin';

const resend = new Resend(process.env.RESEND_API_KEY);

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey) privateKey = privateKey.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- Randomized email body variations (Task #78) ---

const cheerVariations = [
  (name) => `${name} sees your hard work and wanted to send you some encouragement. Keep it up &mdash; your faithfulness matters!`,
  (name) => `${name} noticed your dedication to your heartwork and cheered you on. You're doing great &mdash; run the race with endurance!`,
  (name) => `${name} is proud of the effort you're putting in. Your consistency is bearing fruit &mdash; keep going!`,
  (name) => `${name} sent you a cheer because your progress hasn't gone unnoticed. Well done &mdash; press on!`,
  (name) => `${name} wants you to know your faithfulness in the small things is inspiring. Keep up the good work!`,
  (name) => `${name} cheered you on today! Your commitment to growth is evident and encouraging to those around you.`,
  (name) => `${name} sees you putting in the work and wants to celebrate that. You're on the right path &mdash; don't grow weary!`,
  (name) => `${name} wanted to encourage you &mdash; your diligence in your heartwork is bearing fruit. Keep being faithful!`,
  (name) => `${name} is grateful for your effort and wanted you to know it. Press on toward the goal &mdash; the work you're doing matters!`,
  (name) => `${name} sent you a cheer to let you know you're not alone in this. Your growth is real and it shows!`,
];

const nudgeVariations = [
  (name) => `${name} noticed you've fallen behind and wants to encourage you to get back on track. You can do this!`,
  (name) => `${name} is thinking of you and sent a reminder &mdash; don't let your heartwork slip. Be faithful in the small things.`,
  (name) => `${name} wants you to know they're watching and cheering for you, but you've got some catching up to do.`,
  (name) => `${name} sent you a nudge &mdash; your heartwork is falling behind. Pick it back up today!`,
  (name) => `${name} cares about your growth and noticed you're slipping. Take a few minutes today and get back at it.`,
  (name) => `${name} is in your corner, but they want to see you press on. Don't grow weary &mdash; get your heartwork done.`,
  (name) => `${name} sent you a nudge because they believe in you. You're behind, but it's not too late to catch up.`,
  (name) => `${name} noticed you've been quiet lately. Your heartwork matters &mdash; and so does your growth. Run the race set before you.`,
  (name) => `${name} wants to remind you that endurance matters. You've fallen behind &mdash; today's a great day to change that.`,
  (name) => `${name} is holding you accountable because they care. Don't let another day go by &mdash; open your heartwork and be faithful.`,
];

// Shared verse pool (NASB 1995) — randomly appended to cheer & nudge emails
const versePool = [
  { ref: 'Hebrews 10:24', text: 'and let us consider how to stimulate one another to love and good deeds,' },
  { ref: '1 Corinthians 15:58', text: 'Therefore, my beloved brethren, be steadfast, immovable, always abounding in the work of the Lord, knowing that your toil is not in vain in the Lord.' },
  { ref: 'Ephesians 4:22-24', text: 'that, in reference to your former manner of life, you lay aside the old self, which is being corrupted in accordance with the lusts of deceit, and that you be renewed in the spirit of your mind, and put on the new self, which in the likeness of God has been created in righteousness and holiness of the truth.' },
  { ref: 'Ephesians 4:29', text: 'Let no unwholesome word proceed from your mouth, but only such a word as is good for edification according to the need of the moment, so that it will give grace to those who hear.' },
  { ref: '1 Thessalonians 5:14', text: 'We urge you, brethren, admonish the unruly, encourage the fainthearted, help the weak, be patient with everyone.' },
  { ref: '1 Thessalonians 5:11', text: 'Therefore encourage one another and build up one another, just as you also are doing.' },
  { ref: 'Hebrews 3:13', text: "But encourage one another day after day, as long as it is still called 'Today,' so that none of you will be hardened by the deceitfulness of sin." },
  { ref: 'Galatians 6:2', text: 'Bear one another\u2019s burdens, and thereby fulfill the law of Christ.' },
  { ref: 'Matthew 11:28', text: 'Come to Me, all who are weary and heavy-laden, and I will give you rest.' },
  { ref: 'Psalm 55:22', text: 'Cast your burden upon the LORD and He will sustain you; He will never allow the righteous to be shaken.' },
  { ref: 'Isaiah 40:31', text: 'Yet those who wait for the LORD will gain new strength; they will mount up with wings like eagles, they will run and not get tired, they will walk and not become weary.' },
  { ref: 'Psalm 121:1-2', text: 'I will lift up my eyes to the mountains; from where shall my help come? My help comes from the LORD, who made heaven and earth.' },
  { ref: '1 Corinthians 16:13', text: 'Be on the alert, stand firm in the faith, act like men, be strong.' },
  { ref: 'Hebrews 4:12', text: 'For the word of God is living and active and sharper than any two-edged sword, and piercing as far as the division of soul and spirit, of both joints and marrow, and able to judge the thoughts and intentions of the heart.' },
  { ref: '2 Timothy 3:16', text: 'All Scripture is inspired by God and profitable for teaching, for reproof, for correction, for training in righteousness;' },
  { ref: 'Psalm 119:105', text: 'Your word is a lamp to my feet and a light to my path.' },
  { ref: 'Joshua 1:8', text: 'This book of the law shall not depart from your mouth, but you shall meditate on it day and night, so that you may be careful to do according to all that is written in it; for then you will make your way prosperous, and then you will have success.' },
  { ref: 'Psalm 119:11', text: 'Your word I have treasured in my heart, that I may not sin against You.' },
  { ref: '1 Peter 2:2', text: 'like newborn babies, long for the pure milk of the word, so that by it you may grow in respect to salvation,' },
  { ref: 'Psalm 119:18', text: 'Open my eyes, that I may behold wonderful things from Your law.' },
  { ref: '2 Timothy 2:15', text: 'Be diligent to present yourself approved to God as a workman who does not need to be ashamed, accurately handling the word of truth.' },
  { ref: 'Psalm 119:130', text: 'The unfolding of Your words gives light; It gives understanding to the simple.' },
  { ref: 'Proverbs 30:5', text: 'Every word of God is tested; He is a shield to those who take refuge in Him.' },
  { ref: '2 Timothy 4:2', text: 'preach the word; be ready in season and out of season; reprove, rebuke, exhort, with great patience and instruction.' },
  { ref: 'Psalm 1:1-3', text: 'How blessed is the man who does not walk in the counsel of the wicked, Nor stand in the path of sinners, Nor sit in the seat of scoffers! But his delight is in the law of the LORD, And in His law he meditates day and night. He will be like a tree firmly planted by streams of water, Which yields its fruit in its season And its leaf does not wither; And in whatever he does, he prospers.' },
  { ref: 'Romans 10:17', text: 'So faith comes from hearing, and hearing by the word of Christ.' },
  { ref: 'Job 23:12', text: 'I have not departed from the command of His lips; I have treasured the words of His mouth more than my necessary food.' },
  { ref: 'John 8:31', text: "So Jesus was saying to those Jews who had believed Him, 'If you continue in My word, then you are truly disciples of Mine;'" },
  { ref: '1 Timothy 4:13', text: 'Until I come, give attention to the public reading of Scripture, to exhortation and teaching.' },
  { ref: 'John 20:31', text: 'but these have been written so that you may believe that Jesus is the Christ, the Son of God; and that believing you may have life in His name.' },
  { ref: 'Isaiah 40:8', text: 'The grass withers, the flower fades, But the word of our God stands forever.' },
  { ref: 'Psalm 19:7-8', text: 'The law of the LORD is perfect, restoring the soul; The testimony of the LORD is sure, making wise the simple. The precepts of the LORD are right, rejoicing the heart; The commandment of the LORD is pure, enlightening the eyes.' },
  { ref: 'Deuteronomy 6:6-7', text: 'These words, which I am commanding you today, shall be on your heart. You shall teach them diligently to your sons and shall talk of them when you sit in your house and when you walk by the way and when you lie down and when you rise up.' },
  { ref: '1 John 4:11', text: 'Beloved, if God so loved us, we also ought to love one another.' },
  { ref: '1 John 4:7', text: 'Beloved, let us love one another, for love is from God; and everyone who loves is born of God and knows God.' },
  { ref: '1 John 3:23', text: 'This is His commandment, that we believe in the name of His Son Jesus Christ, and love one another, just as He commanded us.' },
  { ref: '1 John 3:11', text: 'For this is the message which you have heard from the beginning, that we should love one another.' },
  { ref: '1 Thessalonians 4:18', text: 'Therefore comfort one another with these words.' },
  { ref: 'Colossians 3:16', text: 'Let the word of Christ richly dwell within you, with all wisdom teaching and admonishing one another with psalms and hymns and spiritual songs, singing with thankfulness in your hearts to God.' },
  { ref: 'Colossians 3:13', text: 'bearing with one another, and forgiving each other, whoever has a complaint against anyone; just as the Lord forgave you, so also should you.' },
  { ref: 'Ephesians 4:32', text: 'Be kind to one another, tender-hearted, forgiving each other, just as God in Christ also has forgiven you.' },
  { ref: 'Ephesians 4:2', text: 'with all humility and gentleness, with patience, showing tolerance for one another in love,' },
  { ref: 'Galatians 5:13', text: 'For you were called to freedom, brethren; only do not turn your freedom into an opportunity for the flesh, but through love serve one another.' },
  { ref: 'Romans 13:8', text: 'Owe nothing to anyone except to love one another; for he who loves his neighbor has fulfilled the law.' },
  { ref: 'Romans 12:10', text: 'Be devoted to one another in brotherly love; give preference to one another in honor.' },
  { ref: 'John 15:17', text: 'This I command you, that you love one another.' },
  { ref: 'John 15:12', text: 'This is My commandment, that you love one another, just as I have loved you.' },
  { ref: '1 Peter 4:10', text: 'As each one has received a special gift, employ it in serving one another as good stewards of the manifold grace of God.' },
  { ref: '1 Peter 4:9', text: 'Be hospitable to one another without complaint.' },
  { ref: 'Romans 12:2', text: 'And do not be conformed to this world, but be transformed by the renewing of your mind, so that you may prove what the will of God is, that which is good and acceptable and perfect.' },
  { ref: '1 John 2:15', text: 'Do not love the world nor the things in the world. If anyone loves the world, the love of the Father is not in him.' },
  { ref: 'Ephesians 4:15', text: 'but speaking the truth in love, we are to grow up in all aspects into Him who is the head, even Christ,' },
  { ref: 'John 3:16', text: 'For God so loved the world, that He gave His only begotten Son, that whoever believes in Him shall not perish, but have eternal life.' },
  { ref: 'Revelation 21:4', text: 'and He will wipe away every tear from their eyes; and there will no longer be any death; there will no longer be any mourning, or crying, or pain; the first things have passed away.' },
  { ref: 'Romans 8:38-39', text: 'For I am convinced that neither death, nor life, nor angels, nor principalities, nor things present, nor things to come, nor powers, nor height, nor depth, nor any other created thing, will be able to separate us from the love of God, which is in Christ Jesus our Lord.' },
  { ref: 'Isaiah 53:5', text: 'But He was pierced through for our transgressions, He was crushed for our iniquities; The chastening for our well-being fell upon Him, And by His scourging we are healed.' },
  { ref: 'John 11:25', text: "Jesus said to her, 'I am the resurrection and the life; he who believes in Me will live even if he dies,'" },
  { ref: '1 Peter 3:18', text: 'For Christ also died for sins once for all, the just for the unjust, so that He might bring us to God, having been put to death in the flesh, but made alive in the spirit;' },
  { ref: '2 Corinthians 5:21', text: 'He made Him who knew no sin to be sin on our behalf, so that we might become the righteousness of God in Him.' },
  { ref: '1 John 3:16', text: 'We know love by this, that He laid down His life for us; and we ought to lay down our lives for the brethren.' },
  { ref: 'Romans 14:8', text: "for if we live, we live for the Lord, or if we die, we die for the Lord; therefore whether we live or die, we are the Lord's." },
  { ref: '1 Corinthians 10:13', text: 'No temptation has overtaken you but such as is common to man; and God is faithful, who will not allow you to be tempted beyond what you are able, but with the temptation will provide the way of escape also, so that you will be able to endure it.' },
  { ref: 'John 4:14', text: 'but whoever drinks of the water that I will give him shall never thirst; but the water that I will give him will become in him a well of water springing up to eternal life.' },
  { ref: 'Matthew 4:4', text: "But He answered and said, 'It is written, Man shall not live on bread alone, but on every word that proceeds out of the mouth of God.'" },
  { ref: 'Deuteronomy 8:3', text: 'He humbled you and let you be hungry, and fed you with manna which you did not know, nor did your fathers know, that He might make you understand that man does not live by bread alone, but man lives by everything that proceeds out of the mouth of the Lord.' },
  { ref: 'John 6:35', text: "Jesus said to them, 'I am the bread of life; he who comes to Me will not hunger, and he who believes in Me will never thirst.'" },
  { ref: 'John 6:27', text: 'Do not work for the food which perishes, but for the food which endures to eternal life, which the Son of Man will give to you, for on Him the Father, God, has set His seal.' },
  { ref: '1 John 5:14', text: 'This is the confidence which we have before Him, that, if we ask anything according to His will, He hears us.' },
  { ref: 'Psalm 145:18', text: 'The Lord is near to all who call upon Him, To all who call upon Him in truth.' },
  { ref: '1 Thessalonians 5:16-18', text: "Rejoice always; pray without ceasing; in everything give thanks; for this is God's will for you in Christ Jesus." },
  { ref: 'Philippians 4:6-7', text: 'Be anxious for nothing, but in everything by prayer and supplication with thanksgiving let your requests be made known to God. And the peace of God, which surpasses all comprehension, will guard your hearts and your minds in Christ Jesus.' },
  { ref: 'Colossians 4:2', text: 'Devote yourselves to prayer, keeping alert in it with an attitude of thanksgiving;' },
  { ref: 'Hebrews 12:1', text: 'Therefore, since we have so great a cloud of witnesses surrounding us, let us also lay aside every encumbrance and the sin which so easily entangles us, and let us run with endurance the race that is set before us,' },
  { ref: '1 Corinthians 9:24', text: 'Do you not know that those who run in a race all run, but only one receives the prize? Run in such a way that you may win.' },
  { ref: 'Hebrews 12:2', text: 'fixing our eyes on Jesus, the author and perfecter of faith, who for the joy set before Him endured the cross, despising the shame, and has sat down at the right hand of the throne of God.' },
  { ref: '2 Timothy 4:7-8', text: 'I have fought the good fight, I have finished the course, I have kept the faith; in the future there is laid up for me the crown of righteousness, which the Lord, the righteous Judge, will award to me on that day; and not only to me, but also to all who have loved His appearing.' },
  { ref: 'Philippians 3:14', text: 'I press on toward the goal for the prize of the upward call of God in Christ Jesus.' },
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getVerseHtml() {
  const verse = pickRandom(versePool);
  return `<div style="margin: 1.5rem 0; padding: 12px 16px; background: #f7fafc; border-left: 3px solid #2c5282; border-radius: 4px; font-style: italic; color: #4a5568;">
    <p style="margin: 0 0 4px 0;">&ldquo;${escapeHtml(verse.text)}&rdquo;</p>
    <p style="margin: 0; font-size: 0.85rem; font-style: normal; color: #718096; text-align: right;">&mdash; ${escapeHtml(verse.ref)} (NASB)</p>
  </div>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: verify Firebase ID token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  let callerUid;
  try {
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    callerUid = decodedToken.uid;
  } catch (authErr) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const { recipientUid, type, message, senderUid, senderName: bodySenderName, prayerText } = req.body;

    // ── PRAYER REQUEST NOTIFICATIONS ──
    if (type === 'prayer-new' || type === 'prayer-prayed') {
      const db = admin.firestore();

      if (type === 'prayer-new') {
        // Send prayer request notification to ALL APs + counselor
        if (!prayerText) {
          return res.status(400).json({ error: 'Missing prayerText for prayer-new' });
        }

        const senderDoc = await db.collection('users').doc(callerUid).get();
        const senderData = senderDoc.exists ? senderDoc.data() : {};
        const senderDisplayName = senderData.name || bodySenderName || 'Someone';
        const escapedPrayerText = escapeHtml(prayerText.substring(0, 200));
        const escapedSender = escapeHtml(senderDisplayName);

        // Collect recipients: APs (accountabilityPartners) + counselor
        const recipients = [];
        const apList = senderData.accountabilityPartners || [];
        for (const ap of apList) {
          if (ap.uid && ap.email) {
            recipients.push({ uid: ap.uid, email: ap.email, name: ap.name || 'Friend' });
          } else if (ap.uid) {
            const apDoc = await db.collection('users').doc(ap.uid).get();
            if (apDoc.exists && apDoc.data().email) {
              recipients.push({ uid: ap.uid, email: apDoc.data().email, name: apDoc.data().name || 'Friend' });
            }
          }
        }

        // Add counselor if exists
        if (senderData.counselorId) {
          const counselorDoc = await db.collection('users').doc(senderData.counselorId).get();
          if (counselorDoc.exists && counselorDoc.data().email) {
            const cData = counselorDoc.data();
            if (!recipients.some(r => r.uid === senderData.counselorId)) {
              recipients.push({ uid: senderData.counselorId, email: cData.email, name: cData.name || 'Counselor' });
            }
          }
        }

        // Send emails to all recipients
        let sent = 0;
        for (const recipient of recipients) {
          try {
            await resend.emails.send({
              from: 'Counseling Homework <noreply@counselinghomework.com>',
              to: recipient.email,
              subject: `🙏 ${senderDisplayName} shared a prayer request`,
              html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #2c5282;">🙏 ${escapedSender} shared a prayer request</h2>
                  <p>Hi ${escapeHtml(recipient.name)},</p>
                  <p>${escapedSender} is asking for prayer:</p>
                  <blockquote style="border-left: 3px solid #805ad5; padding: 12px 16px; margin: 12px 0; background: #faf5ff; color: #2d3748; font-style: italic; border-radius: 4px;">
                    ${escapedPrayerText}
                  </blockquote>
                  <div style="margin: 2rem 0; text-align: center;">
                    <a href="https://counselinghomework.com" style="background: #805ad5; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 1.1rem;">Open App to Pray</a>
                  </div>
                  <p style="color: #999; font-size: 0.8rem; text-align: center;">
                    You're receiving this because someone you support shared a prayer request on Counseling Homework.
                  </p>
                </div>
              `
            });
            sent++;
          } catch (emailErr) {
            console.error(`Failed to send prayer notification to ${recipient.email}:`, emailErr);
          }
        }

        return res.status(200).json({ success: true, type: 'prayer-new', sent, total: recipients.length });
      }

      if (type === 'prayer-prayed') {
        // Send "someone prayed for you" email to PR owner
        if (!recipientUid || !prayerText) {
          return res.status(400).json({ error: 'Missing recipientUid or prayerText for prayer-prayed' });
        }

        // Rate limit: 1 prayer email per sender per recipient per day
        const chicagoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const todayStart = new Date(chicagoNow);
        todayStart.setHours(0, 0, 0, 0);
        const utcNow = new Date();
        const chicagoOffset = utcNow.getTime() - new Date(utcNow.toLocaleString('en-US', { timeZone: 'America/Chicago' })).getTime();
        const todayStartUtc = new Date(todayStart.getTime() + chicagoOffset);

        const existingPrayer = await db.collection('encouragements')
          .where('senderUid', '==', callerUid)
          .where('recipientUid', '==', recipientUid)
          .where('type', '==', 'prayer-prayed')
          .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(todayStartUtc))
          .get();

        if (!existingPrayer.empty) {
          return res.status(200).json({ success: true, type: 'prayer-prayed', emailSkipped: true });
        }

        // Record in encouragements for rate limiting
        await db.collection('encouragements').add({
          type: 'prayer-prayed',
          senderUid: callerUid,
          senderName: bodySenderName || 'Someone',
          recipientUid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Look up recipient and send email
        const recipientDoc = await db.collection('users').doc(recipientUid).get();
        if (recipientDoc.exists && recipientDoc.data().email) {
          const recipientData = recipientDoc.data();
          const senderDoc = await db.collection('users').doc(callerUid).get();
          const sName = senderDoc.exists ? senderDoc.data().name : (bodySenderName || 'Someone');
          const escapedSender = escapeHtml(sName);
          const escapedPrayerText = escapeHtml(prayerText.substring(0, 100));

          await resend.emails.send({
            from: 'Counseling Homework <noreply@counselinghomework.com>',
            to: recipientData.email,
            subject: `🙏 ${sName} prayed for you`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2c5282;">🙏 ${escapedSender} prayed for you</h2>
                <p>Hi ${escapeHtml(recipientData.name || 'Friend')},</p>
                <p>${escapedSender} prayed for your request:</p>
                <blockquote style="border-left: 3px solid #805ad5; padding: 12px 16px; margin: 12px 0; background: #faf5ff; color: #2d3748; font-style: italic; border-radius: 4px;">
                  ${escapedPrayerText}
                </blockquote>
                <div style="margin: 2rem 0; text-align: center;">
                  <a href="https://counselinghomework.com" style="background: #805ad5; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 1.1rem;">Open App</a>
                </div>
                <p style="color: #999; font-size: 0.8rem; text-align: center;">
                  You're receiving this because someone prayed for your request on Counseling Homework.
                </p>
              </div>
            `
          });
        }

        return res.status(200).json({ success: true, type: 'prayer-prayed' });
      }
    }

    // ── STANDARD ENCOURAGEMENT FLOW ──

    // Validate required fields
    if (!recipientUid || !type) {
      return res.status(400).json({ error: 'Missing required fields: recipientUid, type' });
    }

    // Validate type
    if (!['cheer', 'nudge', 'message'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be: cheer, nudge, or message' });
    }

    // Message required for message type, max 500 chars
    if (type === 'message' && (!message || !message.trim())) {
      return res.status(400).json({ error: 'Message text required for message type' });
    }
    if (message && message.length > 500) {
      return res.status(400).json({ error: 'Message must be 500 characters or less' });
    }

    // Can't encourage yourself
    if (callerUid === recipientUid) {
      return res.status(400).json({ error: 'Cannot send encouragement to yourself' });
    }

    const db = admin.firestore();

    // Rate limit: 1 per type per recipient per day (Chicago timezone)
    const chicagoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const todayStart = new Date(chicagoNow);
    todayStart.setHours(0, 0, 0, 0);
    // Convert back to UTC for Firestore query
    const utcNow = new Date();
    const chicagoOffset = utcNow.getTime() - new Date(utcNow.toLocaleString('en-US', { timeZone: 'America/Chicago' })).getTime();
    const todayStartUtc = new Date(todayStart.getTime() + chicagoOffset);

    const existingQuery = await db.collection('encouragements')
      .where('senderUid', '==', callerUid)
      .where('recipientUid', '==', recipientUid)
      .where('type', '==', type)
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(todayStartUtc))
      .get();

    if (!existingQuery.empty) {
      return res.status(429).json({ error: `Already sent a ${type} to this person today` });
    }

    // Authorization: sender must be AP watcher OR counselor of recipient
    const senderDoc = await db.collection('users').doc(callerUid).get();
    const senderData = senderDoc.exists ? senderDoc.data() : {};
    const senderName = senderData.name || 'Someone';

    const isAPWatcher = (senderData.watchingUsers || []).some(w => w.uid === recipientUid);

    let isCounselor = false;
    if (senderData.isCounselor) {
      const counseleesSnap = await db.collection('counselors').doc(callerUid).collection('counselees')
        .where('uid', '==', recipientUid).get();
      isCounselor = !counseleesSnap.empty;
    }

    if (!isAPWatcher && !isCounselor) {
      return res.status(403).json({ error: 'Not authorized to encourage this user' });
    }

    // Look up recipient
    const recipientDoc = await db.collection('users').doc(recipientUid).get();
    if (!recipientDoc.exists) {
      return res.status(404).json({ error: 'Recipient not found' });
    }
    const recipientData = recipientDoc.data();
    const recipientName = recipientData.name || 'Friend';
    const recipientEmail = recipientData.email;

    // Write encouragement doc
    await db.collection('encouragements').add({
      type,
      senderUid: callerUid,
      senderName,
      recipientUid,
      recipientName,
      recipientEmail: recipientEmail || '',
      message: type === 'message' ? message.trim() : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send email if recipient has email
    if (recipientEmail) {
      const escapedSender = escapeHtml(senderName);
      const verseHtml = (type === 'cheer' || type === 'nudge') ? getVerseHtml() : '';

      const emailTemplates = {
        cheer: {
          subject: `👍 ${senderName} cheered you on!`,
          body: `<p>${pickRandom(cheerVariations)(escapedSender)}</p>`
        },
        nudge: {
          subject: `👊 ${senderName} sent you a nudge`,
          body: `<p>${pickRandom(nudgeVariations)(escapedSender)}</p>`
        },
        message: {
          subject: `💬 ${senderName} sent you a message`,
          body: `<p>${escapedSender} says:</p><blockquote style="border-left: 3px solid #3182ce; padding-left: 12px; margin: 12px 0; color: #2d3748; font-style: italic;">${escapeHtml(message?.trim() || '')}</blockquote>`
        }
      };

      const template = emailTemplates[type];
      await resend.emails.send({
        from: 'Counseling Homework <noreply@counselinghomework.com>',
        to: recipientEmail,
        subject: template.subject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c5282;">${template.subject}</h2>
            <p>Hi ${escapeHtml(recipientName)},</p>
            ${template.body}
            ${verseHtml}
            <div style="margin: 2rem 0; text-align: center;">
              <a href="https://counselinghomework.com" style="background: #3182ce; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 1.1rem;">Open App</a>
            </div>
            <p style="color: #999; font-size: 0.8rem; text-align: center;">
              You're receiving this because someone encouraged you on Counseling Homework.
            </p>
          </div>
        `
      });
    }

    return res.status(200).json({ success: true, type, recipientName });
  } catch (error) {
    console.error('Send encouragement error:', error);
    return res.status(500).json({ error: error.message || 'Failed to send encouragement' });
  }
}
