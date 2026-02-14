import { describe, it, expect } from 'vitest';
import { flattenProperties, FieldMapping } from '../mappingUtils';

describe('flattenProperties', () => {
  it('flattens simple top-level fields', () => {
    const properties = {
      status: { type: 'keyword' },
      amount: { type: 'double' },
    };
    const result: FieldMapping[] = [];
    flattenProperties(properties, '', result);

    expect(result).toEqual([
      { field: 'status', type: 'keyword' },
      { field: 'amount', type: 'double' },
    ]);
  });

  it('flattens nested object properties', () => {
    const properties = {
      customer: {
        properties: {
          name: { type: 'text' },
          age: { type: 'integer' },
        },
      },
    };
    const result: FieldMapping[] = [];
    flattenProperties(properties, '', result);

    expect(result).toEqual([
      { field: 'customer.name', type: 'text' },
      { field: 'customer.age', type: 'integer' },
    ]);
  });

  it('flattens multi-field sub-fields (.keyword, .raw, etc.)', () => {
    const properties = {
      customer_name: {
        type: 'text',
        fields: {
          keyword: { type: 'keyword' },
          raw: { type: 'keyword' },
        },
      },
    };
    const result: FieldMapping[] = [];
    flattenProperties(properties, '', result);

    expect(result).toEqual([
      { field: 'customer_name', type: 'text' },
      { field: 'customer_name.keyword', type: 'keyword' },
      { field: 'customer_name.raw', type: 'keyword' },
    ]);
  });

  it('handles nested objects with multi-field sub-fields', () => {
    const properties = {
      customer: {
        properties: {
          name: {
            type: 'text',
            fields: {
              keyword: { type: 'keyword' },
            },
          },
          email: { type: 'keyword' },
        },
      },
    };
    const result: FieldMapping[] = [];
    flattenProperties(properties, '', result);

    expect(result).toEqual([
      { field: 'customer.name', type: 'text' },
      { field: 'customer.name.keyword', type: 'keyword' },
      { field: 'customer.email', type: 'keyword' },
    ]);
  });

  it('handles prefix parameter correctly', () => {
    const properties = {
      city: { type: 'keyword' },
    };
    const result: FieldMapping[] = [];
    flattenProperties(properties, 'address', result);

    expect(result).toEqual([{ field: 'address.city', type: 'keyword' }]);
  });

  it('handles deeply nested properties', () => {
    const properties = {
      level1: {
        properties: {
          level2: {
            properties: {
              level3: { type: 'keyword' },
            },
          },
        },
      },
    };
    const result: FieldMapping[] = [];
    flattenProperties(properties, '', result);

    expect(result).toEqual([{ field: 'level1.level2.level3', type: 'keyword' }]);
  });

  it('returns empty array for empty properties', () => {
    const result: FieldMapping[] = [];
    flattenProperties({}, '', result);
    expect(result).toEqual([]);
  });

  it('handles fields without a type (object containers)', () => {
    const properties = {
      metadata: {
        properties: {
          tag: { type: 'keyword' },
        },
      },
    };
    const result: FieldMapping[] = [];
    flattenProperties(properties, '', result);

    // metadata itself has no type, only its children should appear
    expect(result).toEqual([{ field: 'metadata.tag', type: 'keyword' }]);
  });
});
