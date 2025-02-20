import {
  Context,
  ContextDataset,
  ContextDatasetSubjects,
  ContextSubject,
  ContextAssociations,
  ContextNiftiHeader,
} from '../types/context.ts'
import { BIDSFile } from '../types/file.ts'
import { FileTree } from '../types/filetree.ts'
import { ColumnsMap } from '../types/columns.ts'
import { BIDSEntities, readEntities } from './entities.ts'
import { DatasetIssues } from '../issues/datasetIssues.ts'
import { parseTSV } from '../files/tsv.ts'
import { loadHeader } from '../files/nifti.ts'
import { buildAssociations } from './associations.ts'
import { ValidatorOptions } from '../setup/options.ts'
import { logger } from '../utils/logger.ts'

export class BIDSContextDataset implements ContextDataset {
  dataset_description: Record<string, unknown>
  options?: ValidatorOptions
  files: any[]
  tree: object
  ignored: any[]
  modalities: any[]
  subjects: ContextDatasetSubjects[]

  constructor(options?: ValidatorOptions, description = {}) {
    this.dataset_description = description
    this.files = []
    this.tree = {}
    this.ignored = []
    this.modalities = []
    this.subjects = [] as ContextDatasetSubjects[]
    if (options) {
      this.options = options
    }
    if (
      !this.dataset_description.DatasetType &&
      this.dataset_description.GeneratedBy
    ) {
      this.dataset_description.DatasetType = 'derivative'
    } else if (!this.dataset_description.DatasetType) {
      this.dataset_description.DatasetType = 'raw'
    }
  }
}

const defaultDsContext = new BIDSContextDataset()

export class BIDSContext implements Context {
  // Internal representation of the file tree
  fileTree: FileTree
  filenameRules: string[]
  issues: DatasetIssues
  file: BIDSFile
  suffix: string
  extension: string
  entities: Record<string, string>
  dataset: ContextDataset
  subject: ContextSubject
  datatype: string
  modality: string
  sidecar: object
  columns: ColumnsMap
  associations: ContextAssociations
  nifti_header?: ContextNiftiHeader

  constructor(
    fileTree: FileTree,
    file: BIDSFile,
    issues: DatasetIssues,
    dsContext?: BIDSContextDataset,
  ) {
    this.fileTree = fileTree
    this.filenameRules = []
    this.issues = issues
    this.file = file
    const bidsEntities = readEntities(file.name)
    this.suffix = bidsEntities.suffix
    this.extension = bidsEntities.extension
    this.entities = bidsEntities.entities
    this.dataset = dsContext ? dsContext : defaultDsContext
    this.subject = {} as ContextSubject
    this.datatype = ''
    this.modality = ''
    this.sidecar = {}
    this.columns = new ColumnsMap()
    this.associations = {} as ContextAssociations
  }

  get json(): Promise<Record<string, any>> {
    return this.file
      .text()
      .then((text) => JSON.parse(text))
      .catch((error) => {})
  }
  get path(): string {
    return this.file.path
  }

  /**
   * Implementation specific absolute path for the dataset root
   *
   * In the browser, this is always at the root
   */
  get datasetPath(): string {
    return this.fileTree.path
  }

  /**
   * Crawls fileTree from root to current context file, loading any valid
   * json sidecars found.
   */
  async loadSidecar(fileTree?: FileTree) {
    if (!fileTree) {
      fileTree = this.fileTree
    }
    const validSidecars = fileTree.files.filter((file) => {
      const { suffix, extension, entities } = readEntities(file.name)
      return (
        extension === '.json' &&
        suffix === this.suffix &&
        Object.keys(entities).every((entity) => {
          return (
            entity in this.entities &&
            entities[entity] === this.entities[entity]
          )
        })
      )
    })

    if (validSidecars.length > 1) {
      const exactMatch = validSidecars.find(
        (sidecar) =>
          sidecar.path == this.file.path.replace(this.extension, '.json'),
      )
      if (exactMatch) {
        validSidecars.splice(1)
        validSidecars[0] = exactMatch
      } else {
        logger.warning(
          `Multiple sidecar files detected for '${this.file.path}'`,
        )
      }
    }

    if (validSidecars.length === 1) {
      const json = await validSidecars[0]
        .text()
        .then((text) => JSON.parse(text))
        .catch((error) => {})
      this.sidecar = { ...this.sidecar, ...json }
    }
    const nextDir = fileTree.directories.find((directory) => {
      return this.file.path.startsWith(directory.path)
    })
    if (nextDir) {
      await this.loadSidecar(nextDir)
    }
  }

  async loadNiftiHeader(): Promise<void> {
    if (
      this.extension.startsWith('.nii') &&
      this.dataset.options &&
      !this.dataset.options.ignoreNiftiHeaders
    ) {
      this.nifti_header = await loadHeader(this.file)
    }
  }

  async loadColumns(): Promise<void> {
    if (this.extension !== '.tsv') {
      return
    }
    this.columns = await this.file
      .text()
      .then((text) => parseTSV(text))
      .catch((error) => {
        logger.warning(
          `tsv file could not be opened by loadColumns '${this.file.path}'`,
        )
        logger.debug(error)
        return new Map<string, string[]>() as ColumnsMap
      })
    return
  }

  async loadAssociations(): Promise<void> {
    this.associations = await buildAssociations(this.fileTree, this)
    return
  }

  async asyncLoads() {
    await Promise.allSettled([
      this.loadSidecar(),
      this.loadColumns(),
      this.loadAssociations(),
    ])
    this.loadNiftiHeader()
  }
}
