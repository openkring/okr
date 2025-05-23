import { getIconColor } from './icon.util';

describe('icon.util', () => {

    // getIconColor
    it('getIconColor()', () => {
        expect(getIconColor(true)).toEqual('gold');
        expect(getIconColor(false)).toEqual('#009D53');
    });
});