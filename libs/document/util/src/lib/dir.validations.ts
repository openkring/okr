import { LONG_NAME_LENGTH } from '@bk2/shared/constants';
import { stringValidations } from '@bk2/shared/util-core';
import { test, enforce, omitWhen } from 'vest';

export function dirValidations(fieldName: string, dir: unknown) {

  stringValidations(fieldName, dir, LONG_NAME_LENGTH);

  omitWhen(dir === '', () => {
    test(fieldName, '@validDirPathFormat', () => {
      enforce(dir)['isURL']({
        protocols: ['http', 'https', 'ftp'],
        require_tld: false,
        require_protocol: false,
        require_host: false,
        require_port: false,
        require_valid_protocol: false,
        allow_underscores: true,
        allow_trailing_dot: true,
        allow_protocol_relative_urls: true,
        allow_fragments: true,
        allow_query_components: false,
        validate_length: true,
      });    
    });
  });
}
