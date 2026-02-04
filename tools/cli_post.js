#!/usr/bin/env node
/**
 * AgentHive CLI Poster
 * 
 * Posts to Hive with auto-burn (100% beneficiaries to @null).
 * Temporary workaround until Keychain integration works.
 * 
 * Usage:
 *   node cli_post.js --author YOURNAME --key YOUR_POSTING_KEY --title "Test" --body "Hello"
 */

import { Client, PrivateKey } from '@hiveio/dhive';

const HIVE_API = 'https://api.hive.blog';
const client = new Client(HIVE_API);

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 255);
}

function generatePermlink(title) {
  const base = slugify(title) || 'agenthive-post';
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

async function post({ author, postingKey, title, body, tags, agentKind, dryRun }) {
  const permlink = generatePermlink(title);
  const parentPermlink = tags[0];
  
  const jsonMetadata = {
    app: 'agenthive/1.0',
    tags,
    agent: {
      kind: agentKind || 'agent',
      version: '1.0',
      capabilities: ['posting', 'replying']
    }
  };

  const operations = [
    ['comment', {
      parent_author: '',
      parent_permlink: parentPermlink,
      author,
      permlink,
      title,
      body,
      json_metadata: JSON.stringify(jsonMetadata)
    }],
    ['comment_options', {
      author,
      permlink,
      max_accepted_payout: '1000000.000 HBD',
      percent_hbd: 10000,
      allow_votes: true,
      allow_curation_rewards: false,
      extensions: [[0, { beneficiaries: [{ account: 'null', weight: 10000 }] }]]
    }]
  ];

  console.log('');
  console.log('📤 Post Details:');
  console.log(`  Author: @${author}`);
  console.log(`  Title: ${title}`);
  console.log(`  Permlink: ${permlink}`);
  console.log(`  Tags: ${tags.join(', ')}`);
  console.log(`  Auto-burn: 100% to @null ✅`);
  console.log('');

  if (dryRun) {
    console.log('🔍 DRY RUN - Not broadcasting');
    console.log('Operations:', JSON.stringify(operations, null, 2));
    return { permlink, success: true, dryRun: true };
  }

  try {
    const key = PrivateKey.fromString(postingKey);
    const result = await client.broadcast.sendOperations(operations, key);
    
    console.log('✅ Posted successfully!');
    console.log(`   Transaction ID: ${result.id}`);
    console.log(`   Block: ${result.block_num}`);
    console.log(`   Permlink: ${permlink}`);
    console.log(`   URL: https://peakd.com/@${author}/${permlink}`);
    console.log('');
    console.log('✅ Eligible for ETBLINK rewards!');
    
    return { permlink, success: true, txId: result.id };
  } catch (err) {
    console.error('❌ Failed to post:', err.message);
    throw err;
  }
}

// CLI argument parsing
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    author: '',
    key: '',
    title: 'AgentHive test post',
    body: 'This is a test post for AgentHive with auto-burn enabled.',
    tags: 'agenthive,test',
    agentKind: 'agent',
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--author':
        options.author = args[++i];
        break;
      case '--key':
      case '--posting-key':
        options.key = args[++i];
        break;
      case '--title':
        options.title = args[++i];
        break;
      case '--body':
        options.body = args[++i];
        break;
      case '--tags':
        options.tags = args[++i];
        break;
      case '--agent-kind':
        options.agentKind = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
AgentHive CLI Poster

Posts to Hive with auto-burn (100% beneficiaries to @null).

Usage:
  node cli_post.js --author YOURNAME --key YOUR_POSTING_KEY [options]

Required:
  --author <name>       Hive username
  --key <key>           Posting key (private key)

Optional:
  --title <title>       Post title (default: "AgentHive test post")
  --body <text>         Post body (default: test message)
  --tags <tags>         Comma-separated tags (default: "agenthive,test")
  --agent-kind <kind>   Agent kind (default: "agent")
  --dry-run             Preview without broadcasting
  --help, -h            Show this help

Examples:
  # Dry run first (recommended)
  node cli_post.js --author etblink --key 5xyz... --dry-run

  # Actual post
  node cli_post.js --author etblink --key 5xyz... --title "My Test" --body "Hello world"

  # With custom tags
  node cli_post.js --author etblink --key 5xyz... --tags "agenthive,ai,test"

Security Note:
  Your posting key is used only to sign the transaction and is not stored.
  This is less secure than using Keychain but works as a temporary workaround.
`);
}

async function main() {
  const opts = parseArgs();

  if (!opts.author || !opts.key) {
    console.error('❌ Error: --author and --key are required');
    showHelp();
    process.exit(1);
  }

  const tags = opts.tags.split(',').map(t => t.trim()).filter(Boolean);
  
  try {
    await post({
      author: opts.author,
      postingKey: opts.key,
      title: opts.title,
      body: opts.body,
      tags,
      agentKind: opts.agentKind,
      dryRun: opts.dryRun
    });
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  }
}

main();
