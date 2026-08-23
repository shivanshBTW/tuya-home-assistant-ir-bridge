import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Catalog, MappingFile, StudyFile } from '../types.js';

const CATALOG_FILE_NAME = 'catalog.json';
const MAPPING_FILE_NAME = 'mapping.json';
const STUDY_FILE_NAME = 'study.json';

const emptyStudyFile = (): StudyFile => ({
  updatedAt: new Date().toISOString(),
  log: [],
  savedButtons: [],
});

export class JsonStore {
  constructor(private readonly dataDir: string) {}

  private catalogPath(): string {
    return path.join(this.dataDir, CATALOG_FILE_NAME);
  }

  private mappingPath(): string {
    return path.join(this.dataDir, MAPPING_FILE_NAME);
  }

  private studyPath(): string {
    return path.join(this.dataDir, STUDY_FILE_NAME);
  }

  async ensureDataDir(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
  }

  async readCatalog(): Promise<Catalog | undefined> {
    try {
      const raw = await readFile(this.catalogPath(), 'utf8');
      return JSON.parse(raw) as Catalog;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }

  async writeCatalog(catalog: Catalog): Promise<void> {
    await this.ensureDataDir();
    await writeFile(this.catalogPath(), `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  }

  async readMapping(): Promise<MappingFile> {
    try {
      const raw = await readFile(this.mappingPath(), 'utf8');
      return JSON.parse(raw) as MappingFile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { updatedAt: new Date().toISOString(), devices: [] };
      }
      throw error;
    }
  }

  async writeMapping(mapping: MappingFile): Promise<void> {
    await this.ensureDataDir();
    const nextMapping: MappingFile = {
      ...mapping,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(this.mappingPath(), `${JSON.stringify(nextMapping, null, 2)}\n`, 'utf8');
  }

  async readStudy(): Promise<StudyFile> {
    try {
      const raw = await readFile(this.studyPath(), 'utf8');
      const parsed = JSON.parse(raw) as Partial<StudyFile>;
      return {
        updatedAt: parsed.updatedAt ?? new Date().toISOString(),
        log: Array.isArray(parsed.log) ? parsed.log : [],
        savedButtons: Array.isArray(parsed.savedButtons) ? parsed.savedButtons : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return emptyStudyFile();
      }
      throw error;
    }
  }

  async writeStudy(study: StudyFile): Promise<void> {
    await this.ensureDataDir();
    const nextStudy: StudyFile = {
      ...study,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(this.studyPath(), `${JSON.stringify(nextStudy, null, 2)}\n`, 'utf8');
  }
}
