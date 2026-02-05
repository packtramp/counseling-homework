// Deploy Firestore rules using service account
// Run with: node scripts/deploy-rules.cjs

const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

async function deployRules() {
  const keyFilePath = path.join(__dirname, '..', 'serviceaccountkey.json');
  const serviceAccount = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
  const projectId = serviceAccount.project_id;

  // Read the rules file
  const rulesPath = path.join(__dirname, '..', 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  console.log('Deploying Firestore rules to project:', projectId);
  console.log('Service account:', serviceAccount.client_email);

  const auth = new GoogleAuth({
    keyFile: keyFilePath,
    scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase']
  });

  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  // Create new ruleset
  const createUrl = `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`;

  const createResp = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: {
        files: [{ name: 'firestore.rules', content: rulesContent }]
      }
    })
  });

  if (!createResp.ok) {
    const err = await createResp.text();
    throw new Error(`Failed to create ruleset: ${err}`);
  }

  const ruleset = await createResp.json();
  console.log('Created ruleset:', ruleset.name);

  // Update the release using PATCH
  const releaseName = `projects/${projectId}/releases/cloud.firestore`;
  const releaseUrl = `https://firebaserules.googleapis.com/v1/${releaseName}`;

  const releaseResp = await fetch(releaseUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      release: {
        name: releaseName,
        rulesetName: ruleset.name
      },
      updateMask: 'rulesetName'
    })
  });

  if (!releaseResp.ok) {
    const err = await releaseResp.text();
    throw new Error(`Failed to update release: ${err}`);
  }

  console.log('✓ Rules deployed successfully!');
}

deployRules().catch(err => {
  console.error('Error deploying rules:', err.message);
  process.exit(1);
});
