/**
 * Seed Think Lists for testing
 *
 * Usage: node scripts/seed-think-lists.cjs
 *
 * This script adds sample Think Lists to a counselee named "Robert Tester"
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceaccountkey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Sample Think Lists based on biblical counseling content
const sampleThinkLists = [
  {
    title: "Responding to Anger",
    verse: "James 1:19-20 - \"My dear brothers and sisters, take note of this: Everyone should be quick to listen, slow to speak and slow to become angry, because human anger does not produce the righteousness that God desires.\"",
    thinkListContent: "Anger is a common response when we feel wronged, disrespected, or threatened. However, God calls us to handle our anger in a way that honors Him. Meditation on this truth helps us pause before reacting and choose a response that reflects Christ's character.",
    attitudePutOff: "Self-righteousness, demanding my way, believing others must meet my expectations",
    attitudePutOn: "Humility, patience, trust in God's sovereignty over every situation",
    thoughtsPutOff: "\"They have no right to treat me this way.\" \"I deserve better.\" \"They need to pay for this.\"",
    thoughtsPutOn: "\"God is in control.\" \"How can I respond in a way that honors Christ?\" \"What does love require of me here?\"",
    actionsPutOff: "Raising my voice, slamming doors, giving the silent treatment, holding grudges",
    actionsPutOn: "Taking a breath before responding, speaking calmly, praying for the person, seeking reconciliation",
    status: "active",
    createdBy: "counselor"
  },
  {
    title: "Anxious Thoughts",
    verse: "Philippians 4:6-7 - \"Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God. And the peace of God, which transcends all understanding, will guard your hearts and your minds in Christ Jesus.\"",
    thinkListContent: "Anxiety often stems from a desire to control outcomes that are beyond our control. God invites us to bring our worries to Him rather than carrying them ourselves. As we practice casting our cares on Him, we experience His supernatural peace.",
    attitudePutOff: "Self-reliance, fear of the future, distrust in God's goodness",
    attitudePutOn: "Dependence on God, faith in His promises, gratitude for His provision",
    thoughtsPutOff: "\"What if everything goes wrong?\" \"I can't handle this.\" \"God has forgotten about me.\"",
    thoughtsPutOn: "\"God is faithful and will provide.\" \"I can do all things through Christ.\" \"God works all things for my good.\"",
    actionsPutOff: "Obsessive planning, losing sleep, avoiding responsibilities, seeking constant reassurance",
    actionsPutOn: "Praying specifically about concerns, journaling God's faithfulness, taking one step at a time, resting in Scripture",
    status: "active",
    createdBy: "counselor"
  },
  {
    title: "Speaking with Grace",
    verse: "Ephesians 4:29 - \"Do not let any unwholesome talk come out of your mouths, but only what is helpful for building others up according to their needs, that it may benefit those who listen.\"",
    thinkListContent: "Our words have immense power to build up or tear down. God calls us to use our speech as a tool for encouragement, truth-telling, and grace. Before speaking, we should ask: Will this help the other person? Does this reflect Christ's love?",
    attitudePutOff: "Criticism, sarcasm as a weapon, using words to control or manipulate",
    attitudePutOn: "Encouragement, building others up, speaking truth in love",
    thoughtsPutOff: "\"They deserve to hear this.\" \"I'm just being honest.\" \"Someone needs to tell them.\"",
    thoughtsPutOn: "\"How can I say this in a way that helps?\" \"Is this the right time?\" \"Am I speaking from love or frustration?\"",
    actionsPutOff: "Gossip, complaining, harsh criticism, interrupting, dismissing others' feelings",
    actionsPutOn: "Active listening, affirming others, choosing words carefully, apologizing quickly when wrong",
    status: "active",
    createdBy: "counselor"
  },
  {
    title: "Contentment in Christ",
    verse: "Philippians 4:11-13 - \"I have learned to be content whatever the circumstances. I know what it is to be in need, and I know what it is to have plenty. I have learned the secret of being content in any and every situation... I can do all this through him who gives me strength.\"",
    thinkListContent: "Contentment is not dependent on circumstances but on our relationship with Christ. Paul learned this secret through years of hardship and blessing. True satisfaction comes not from having more but from knowing Christ more deeply.",
    attitudePutOff: "Entitlement, comparison, believing happiness comes from circumstances",
    attitudePutOn: "Gratitude, satisfaction in Christ alone, joy independent of circumstances",
    thoughtsPutOff: "\"If only I had ____, then I'd be happy.\" \"They have it so much better.\" \"Life is unfair.\"",
    thoughtsPutOn: "\"Christ is enough for me.\" \"What do I have to be thankful for right now?\" \"God has given me everything I need for life and godliness.\"",
    actionsPutOff: "Constantly scrolling social media comparing, impulse buying, complaining about what I lack",
    actionsPutOn: "Daily gratitude list, generous giving, celebrating others' blessings, simplifying possessions",
    status: "active",
    createdBy: "counselor"
  }
];

// Data from list-all-data.cjs output:
// Robert Tester is a counselee with:
// - counselorId: dpmfTQejTFdbJjd1SbJDz73L7rO2
// - counseleeDocId: 9yqKxbg6GKcTWRC53w5K

const COUNSELOR_ID = 'dpmfTQejTFdbJjd1SbJDz73L7rO2';
const COUNSELEE_DOC_ID = '9yqKxbg6GKcTWRC53w5K';
const COUNSELEE_NAME = 'Robert Tester';

async function seedThinkLists() {
  console.log(`Adding Think Lists for counselee: ${COUNSELEE_NAME}`);
  console.log(`  Path: counselors/${COUNSELOR_ID}/counselees/${COUNSELEE_DOC_ID}/thinkLists\n`);

  const thinkListsRef = db
    .collection('counselors')
    .doc(COUNSELOR_ID)
    .collection('counselees')
    .doc(COUNSELEE_DOC_ID)
    .collection('thinkLists');

  for (const thinkList of sampleThinkLists) {
    const docRef = await thinkListsRef.add({
      ...thinkList,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      submittedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`  Created: "${thinkList.title}" (ID: ${docRef.id})`);
  }

  console.log(`\nDone! Added ${sampleThinkLists.length} Think Lists.`);
}

seedThinkLists().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
