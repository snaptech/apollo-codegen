import { readFileSync } from 'fs';
import * as path from 'path';

import { loadAndMergeQueryDocuments } from '../src/loading';

describe('Validation', () => {
  test(`should extract gql snippet from javascript file`, () => {
    const inputPaths = [
      path.join(__dirname, './starwars/gqlQueries.js'),
    ];

    const document = loadAndMergeQueryDocuments(inputPaths);

    expect(document).toMatchSnapshot();
  })
});
