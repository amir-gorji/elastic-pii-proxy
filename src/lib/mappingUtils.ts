export interface FieldMapping {
  field: string;
  type: string;
}

/**
 * Flatten ES mapping properties into a flat list of field paths and types.
 * Handles nested `properties` (object/nested fields) and multi-field
 * sub-fields under the `fields` key (e.g. `customer_name.keyword`).
 */
export function flattenProperties(
  properties: Record<string, any>,
  prefix: string,
  result: FieldMapping[],
): void {
  for (const [name, mapping] of Object.entries(properties)) {
    const fieldPath = prefix ? `${prefix}.${name}` : name;

    if (mapping.type) {
      result.push({ field: fieldPath, type: mapping.type });
    }

    // Recurse into nested object / nested-type properties
    if (mapping.properties) {
      flattenProperties(mapping.properties, fieldPath, result);
    }

    // Recurse into multi-field sub-fields (.keyword, .text, etc.)
    if (mapping.fields) {
      flattenProperties(mapping.fields, fieldPath, result);
    }
  }
}
