const bcrypt = require('bcrypt');

async function generateHash() {
  const plainPassword = 'password';
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(plainPassword, salt);
  console.log('Password:', plainPassword);
  console.log('Hash:', hash);
}

generateHash();