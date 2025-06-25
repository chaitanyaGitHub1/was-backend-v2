const path = require('path');
const { loadFilesSync } = require('@graphql-tools/load-files');
const { mergeTypeDefs } = require('@graphql-tools/merge');

// Load all .graphql files from the schema directory
const typesArray = loadFilesSync(path.join(__dirname, './**/*.graphql'));

// Merge all type definitions into a single schema
const typeDefs = mergeTypeDefs(typesArray);

module.exports = typeDefs;