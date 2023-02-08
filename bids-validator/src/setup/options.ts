import { Command, EnumType } from '../deps/cliffy.ts'

export type DebugLevels = 'debug' | 'info' | 'warning' | 'error' | 'critical'

export type ValidatorOptions = {
  datasetPath: string
  schema?: string
  legacy?: boolean
  json?: boolean
  verbose?: boolean
  ignoreNiftiHeaders?: boolean
  filenameMode?: boolean
  debug: string
}

/**
 * Parse command line options and return a ValidatorOptions config
 * @param argumentOverride Override the arguments instead of using Deno.args
 */
export async function parseOptions(
  argumentOverride: string[] = Deno.args,
): Promise<ValidatorOptions> {
  const { args, options } = await new Command()
    .name('bids-validator')
    .type(
      'debugLevel',
      new EnumType(['debug', 'info', 'warning', 'error', 'critical']),
    )
    .description(
      'This tool checks if a dataset in a given directory is compatible with the Brain Imaging Data Structure specification. To learn more about Brain Imaging Data Structure visit http://bids.neuroimaging.io',
    )
    .arguments('<dataset_directory>')
    .version('alpha')
    .option('--legacy', 'Enable running both validators together')
    .option('--json', 'Output machine readable JSON')
    .option(
      '-s, --schema <type:string>',
      'Specify a schema version to use for validation',
      {
        default: 'latest',
      },
    )
    .option('-v, --verbose', 'Log more extensive information about issues')
    .option(
      '--ignoreNiftiHeaders',
      'Disregard NIfTI header content during validation',
    )
    .option('--debug <type:debugLevel>', 'Enable debug output', {
      default: 'error',
      hidden: true,
    })
    .option(
      '--filenameMode',
      'Enable filename checks for newline separated filenames read from stdin',
    )
    .parse(argumentOverride)
  return {
    datasetPath: args[0],
    ...options,
  }
}
