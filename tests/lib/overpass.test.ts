import { parseTag } from '@/lib/overpass';

describe('parseTag', () => {
  it('should parse empty tags correctly with defaults', () => {
    const result = parseTag({});
    expect(result).toMatchObject({
      name: 'Unnamed Parking',
      wheelchair: 'unknown',
      van_accessible: null,
      check_date_wheelchair: null,
      verified_at: null,
      opening_hours: null,
      parking_type: null,
      maxstay: null,
      capacity_total: null,
      capacity_disabled: null,
      surface: null,
      fee: null,
      covered: null,
      lit: null,
      access: null,
      height: null,
      ramp_wheelchair: null,
      address: null,
      level: null,
      phone: null,
      website: null,
    });
  });

  describe('name parsing', () => {
    it('should use name tag if present', () => {
      const result = parseTag({ name: 'Central Parking' });
      expect(result.name).toBe('Central Parking');
    });

    it('should fallback to operator if name is missing', () => {
      const result = parseTag({ operator: 'City Council' });
      expect(result.name).toBe('City Council');
    });

    it('should fallback to brand if name and operator are missing', () => {
      const result = parseTag({ brand: 'NCP' });
      expect(result.name).toBe('NCP');
    });

    it('should sanitize the name', () => {
      const result = parseTag({ name: '<script>alert(1)</script>Safe Name' });
      expect(result.name).toBe('alert(1)Safe Name');
    });
  });

  describe('wheelchair parsing', () => {
    it('should accept valid wheelchair values', () => {
      expect(parseTag({ wheelchair: 'yes' }).wheelchair).toBe('yes');
      expect(parseTag({ wheelchair: 'limited' }).wheelchair).toBe('limited');
      expect(parseTag({ wheelchair: 'no' }).wheelchair).toBe('no');
    });

    it('should default to unknown for invalid values', () => {
      expect(parseTag({ wheelchair: 'sometimes' }).wheelchair).toBe('unknown');
    });
  });

  describe('van accessibility', () => {
    it('should detect explicit van_accessible', () => {
      expect(parseTag({ van_accessible: 'yes' }).van_accessible).toBe(true);
      expect(parseTag({ van_accessible: 'no' }).van_accessible).toBe(false);
    });

    it('should detect motorcar:disabled', () => {
      expect(parseTag({ 'motorcar:disabled': 'yes' }).van_accessible).toBe(true);
    });

    it('should detect from capacity:disabled:motorcar', () => {
      expect(parseTag({ 'capacity:disabled:motorcar': '1' }).van_accessible).toBe(true);
      expect(parseTag({ 'capacity:disabled:motorcar': '0' }).van_accessible).toBe(null);
      expect(parseTag({ 'capacity:disabled:motorcar': 'invalid' }).van_accessible).toBe(null);
    });
  });

  describe('check dates', () => {
    it('should parse valid check_date:wheelchair', () => {
      expect(parseTag({ 'check_date:wheelchair': '2023-05-12' }).check_date_wheelchair).toBe('2023-05-12');
      expect(parseTag({ 'check_date:wheelchair': '2023-05' }).check_date_wheelchair).toBe('2023-05');
      expect(parseTag({ 'check_date:wheelchair': '2023' }).check_date_wheelchair).toBe('2023');
    });

    it('should fallback to check_date', () => {
      expect(parseTag({ 'check_date': '2023-05-12' }).check_date_wheelchair).toBe('2023-05-12');
    });

    it('should ignore invalid dates', () => {
      expect(parseTag({ 'check_date:wheelchair': 'today' }).check_date_wheelchair).toBe(null);
      expect(parseTag({ 'check_date': '2023/05/12' }).check_date_wheelchair).toBe(null);
    });
  });

  describe('parking type', () => {
    it('should accept valid parking types', () => {
      expect(parseTag({ parking: 'underground' }).parking_type).toBe('underground');
      expect(parseTag({ parking: 'rooftop' }).parking_type).toBe('rooftop');
    });

    it('should classify unknown types as "other"', () => {
      expect(parseTag({ parking: 'custom_type' }).parking_type).toBe('other');
    });
  });

  describe('capacity parsing', () => {
    it('should parse valid capacities', () => {
      expect(parseTag({ capacity: '100', 'capacity:disabled': '5' })).toMatchObject({
        capacity_total: 100,
        capacity_disabled: 5,
      });
    });

    it('should ignore invalid or out of bounds capacities', () => {
      expect(parseTag({ capacity: '0', 'capacity:disabled': '-1' })).toMatchObject({
        capacity_total: null,
        capacity_disabled: null,
      });
      expect(parseTag({ capacity: '1000000', 'capacity:disabled': '10000' })).toMatchObject({
        capacity_total: null,
        capacity_disabled: null,
      });
      expect(parseTag({ capacity: 'lots', 'capacity:disabled': 'few' })).toMatchObject({
        capacity_total: null,
        capacity_disabled: null,
      });
    });
  });

  describe('address combining', () => {
    it('should combine house number and street', () => {
      expect(parseTag({ 'addr:housenumber': '123', 'addr:street': 'Main St' }).address).toBe('123 Main St');
    });

    it('should handle only street or only house number', () => {
      expect(parseTag({ 'addr:street': 'Main St' }).address).toBe('Main St');
      expect(parseTag({ 'addr:housenumber': '123' }).address).toBe('123');
    });
  });

  describe('boolean flags', () => {
    it('should parse fee flag', () => {
      expect(parseTag({ fee: 'yes' }).fee).toBe(true);
      expect(parseTag({ fee: 'no' }).fee).toBe(false);
      expect(parseTag({ fee: 'unknown' }).fee).toBe(null);
    });

    it('should parse lit flag', () => {
      expect(parseTag({ lit: 'yes' }).lit).toBe(true);
      expect(parseTag({ lit: 'no' }).lit).toBe(false);
    });

    it('should parse covered flag', () => {
      expect(parseTag({ covered: 'yes' }).covered).toBe(true);
      expect(parseTag({ covered: 'no' }).covered).toBe(false);
    });

    it('should parse ramp:wheelchair flag', () => {
      expect(parseTag({ 'ramp:wheelchair': 'yes' }).ramp_wheelchair).toBe(true);
      expect(parseTag({ 'ramp:wheelchair': 'no' }).ramp_wheelchair).toBe(false);
      expect(parseTag({ ramp: 'yes' }).ramp_wheelchair).toBe(true); // Fallback
    });
  });

  describe('other tags sanitization', () => {
    it('should sanitize maxstay, surface, access, height, level, phone, website', () => {
      const tags = {
        maxstay: '2 hours<script>',
        surface: 'asphalt<img/>',
        access: 'private<b>',
        height: '2m<i>',
        level: '-1',
        phone: '123-456-7890',
        website: 'https://example.com/<a>',
      };

      const result = parseTag(tags);
      expect(result.maxstay).toBe('2 hours');
      expect(result.surface).toBe('asphalt');
      expect(result.access).toBe('private');
      expect(result.height).toBe('2m');
      expect(result.level).toBe('-1');
      expect(result.phone).toBe('123-456-7890');
      expect(result.website).toBe('https://example.com/');
    });

    it('should support alternative tag names for height, phone, website', () => {
      const tags = {
        maxheight: '2m',
        'contact:phone': '123-456',
        url: 'example.com',
      };

      const result = parseTag(tags);
      expect(result.height).toBe('2m');
      expect(result.phone).toBe('123-456');
      expect(result.website).toBe('example.com');
    });
  });
});
