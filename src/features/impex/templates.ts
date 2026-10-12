import { emptyColumn, type ImpexColumn, type ImpexConfig } from './model';

const col = (attribute: string, extra: Partial<ImpexColumn> = {}): ImpexColumn => ({ ...emptyColumn(attribute), ...extra });

export interface ImpexTemplate {
  id: string;
  label: string;
  note: string;
  config: ImpexConfig;
}

const catalogMacros = [
  { name: 'catalog', value: 'electronicsProductCatalog' },
  { name: 'version', value: 'Staged' },
  { name: 'catalogVersion', value: 'catalogVersion(catalog(id[default=$catalog]),version[default=$version])[unique=true,default=$catalog:$version]' },
];

/** Starter examples only. They are not verified against any target installation. */
export const TEMPLATES: ImpexTemplate[] = [
  {
    id: 'product',
    label: 'Product',
    note: 'Catalog-aware product with localized name.',
    config: {
      mode: 'INSERT_UPDATE', type: 'Product', typeModifiers: '', comment: 'Example products', macros: catalogMacros,
      columns: [col('code', { unique: true }), col('$catalogVersion'), col('name', { lang: 'en' }), col('unit(code)', { defaultValue: 'pieces' })],
      rows: [['P-1000', '', 'Sample product', ''], ['P-1001', '', 'Another product', 'pieces']],
    },
  },
  {
    id: 'category',
    label: 'Category',
    note: 'Category with supercategories.',
    config: {
      mode: 'INSERT_UPDATE', type: 'Category', typeModifiers: '', comment: '', macros: catalogMacros,
      columns: [col('code', { unique: true }), col('$catalogVersion'), col('name', { lang: 'en' }), col('supercategories(code,catalogVersion(catalog(id),version))')],
      rows: [['cameras', '', 'Cameras', '']],
    },
  },
  {
    id: 'catalogversion',
    label: 'CatalogVersion',
    note: 'Catalog version with active flag.',
    config: {
      mode: 'INSERT_UPDATE', type: 'CatalogVersion', typeModifiers: '', comment: '', macros: [],
      columns: [col('catalog(id)', { unique: true }), col('version', { unique: true }), col('active')],
      rows: [['electronicsProductCatalog', 'Staged', 'false'], ['electronicsProductCatalog', 'Online', 'true']],
    },
  },
  {
    id: 'media',
    label: 'Media',
    note: 'Media with catalog version and mime type.',
    config: {
      mode: 'INSERT_UPDATE', type: 'Media', typeModifiers: '', comment: '', macros: catalogMacros,
      columns: [col('code', { unique: true }), col('$catalogVersion'), col('mime'), col('realfilename')],
      rows: [['sample-media', '', 'image/png', 'sample.png']],
    },
  },
  {
    id: 'customer',
    label: 'Customer',
    note: 'Customer with user groups.',
    config: {
      mode: 'INSERT_UPDATE', type: 'Customer', typeModifiers: '', comment: '', macros: [],
      columns: [col('uid', { unique: true }), col('name'), col('groups(uid)'), col('customerID')],
      rows: [['jane.doe@example.com', 'Jane Doe', 'customergroup', '']],
    },
  },
  {
    id: 'remove',
    label: 'REMOVE example',
    note: 'Demonstrates the destructive-mode warning.',
    config: {
      mode: 'REMOVE', type: 'Product', typeModifiers: '', comment: '', macros: catalogMacros,
      columns: [col('code', { unique: true }), col('$catalogVersion')],
      rows: [['P-1000', '']],
    },
  },
];
