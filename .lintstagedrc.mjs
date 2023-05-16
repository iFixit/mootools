export default {
   '*.ts': ['tsc --noEmit', 'eslint --fix', 'prettier --write'],
   '*.js': 'prettier --write',
   '*.json': 'prettier --write',
   'package.json': 'sort-package-json',
};
