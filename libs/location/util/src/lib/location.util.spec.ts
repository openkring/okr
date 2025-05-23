import { getDirectionFromAzimuth, DirectionFormat } from './location.util';

describe('getDirectionFromAzimuth function', () => {
  it('should return the correct direction abbreviation for different azimuth angles', () => {
    expect(getDirectionFromAzimuth(0)).toBe('N');
    expect(getDirectionFromAzimuth(22)).toBe('N');
    expect(getDirectionFromAzimuth(23)).toBe('NE');
    expect(getDirectionFromAzimuth(67)).toBe('NE');
    expect(getDirectionFromAzimuth(68)).toBe('E');
    expect(getDirectionFromAzimuth(112)).toBe('E');
    expect(getDirectionFromAzimuth(113)).toBe('SE');
    expect(getDirectionFromAzimuth(157)).toBe('SE');
    expect(getDirectionFromAzimuth(158)).toBe('S');
    expect(getDirectionFromAzimuth(202)).toBe('S');
    expect(getDirectionFromAzimuth(203)).toBe('SW');
    expect(getDirectionFromAzimuth(247)).toBe('SW');
    expect(getDirectionFromAzimuth(248)).toBe('W');
    expect(getDirectionFromAzimuth(292)).toBe('W');
    expect(getDirectionFromAzimuth(293)).toBe('NW');
    expect(getDirectionFromAzimuth(337)).toBe('NW');
    expect(getDirectionFromAzimuth(338)).toBe('N');
    expect(getDirectionFromAzimuth(360)).toBe('N');
  });

  it('should return the correct full direction name for different azimuth angles', () => {
    expect(getDirectionFromAzimuth(0, DirectionFormat.Name)).toBe('Nord');
    expect(getDirectionFromAzimuth(22, DirectionFormat.Name)).toBe('Nord');
    expect(getDirectionFromAzimuth(23, DirectionFormat.Name)).toBe('Nordost');
    expect(getDirectionFromAzimuth(67, DirectionFormat.Name)).toBe('Nordost');
    expect(getDirectionFromAzimuth(68, DirectionFormat.Name)).toBe('Ost');
    expect(getDirectionFromAzimuth(112, DirectionFormat.Name)).toBe('Ost');
    expect(getDirectionFromAzimuth(113, DirectionFormat.Name)).toBe('Südost');
    expect(getDirectionFromAzimuth(157, DirectionFormat.Name)).toBe('Südost');
    expect(getDirectionFromAzimuth(158, DirectionFormat.Name)).toBe('Süd');
    expect(getDirectionFromAzimuth(202, DirectionFormat.Name)).toBe('Süd');
    expect(getDirectionFromAzimuth(203, DirectionFormat.Name)).toBe('Südwest');
    expect(getDirectionFromAzimuth(247, DirectionFormat.Name)).toBe('Südwest');
    expect(getDirectionFromAzimuth(248, DirectionFormat.Name)).toBe('West');
    expect(getDirectionFromAzimuth(292, DirectionFormat.Name)).toBe('West');
    expect(getDirectionFromAzimuth(293, DirectionFormat.Name)).toBe('Nordwest');
    expect(getDirectionFromAzimuth(337, DirectionFormat.Name)).toBe('Nordwest');
    expect(getDirectionFromAzimuth(338, DirectionFormat.Name)).toBe('Nord');
    expect(getDirectionFromAzimuth(360, DirectionFormat.Name)).toBe('Nord');
  });
});
