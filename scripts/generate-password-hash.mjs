#!/usr/bin/env node
import { hash } from 'bcryptjs';

const password = process.argv[2];

if (!password) {
  console.error('使用方法: node scripts/generate-password-hash.mjs <password>');
  console.error('例: node scripts/generate-password-hash.mjs MyPassword123');
  process.exit(1);
}

console.log('パスワード:', password);
console.log('ハッシュ化中...\n');

const passwordHash = await hash(password, 10);

console.log('生成されたハッシュ:');
console.log(passwordHash);
console.log('\n環境変数に設定する値:');
console.log(`BACKOFFICE_PASSWORD_HASH=${passwordHash}`);

