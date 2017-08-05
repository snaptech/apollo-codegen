import * as fs from 'fs';

import { ToolError, logError } from './errors'
import { loadAndMergeQueryDocuments } from './loading'
import { validateQueryDocument } from './validation'
import { compileToIR } from './compilation'
import serializeToJSON from './serializeToJSON'
import { generateSource as generateSwiftSource } from './swift'
import { generateSource as generateTypescriptSource } from './typescript'
import { generateSource as generateFlowSource } from './flow'
import {buildASTSchema, concatAST, DocumentNode, extendSchema, GraphQLSchema, Source, parse} from 'graphql';
import { Kind } from 'graphql/language';
import {withTypenameFieldAddedWhereNeeded, getNamedTypeString} from "./utilities/graphql";

type TargetType = 'json' | 'swift' | 'ts' | 'typescript' | 'flow';

export default function generate(
  inputPaths: string[],
  schemaPaths: string[],
  outputPath: string,
  target: TargetType,
  tagName: string,
  options: any
) {
  let schema = loadAndMergeQueryDocuments(schemaPaths, tagName);
  let schemaAST = buildASTSchema(schema);
  let extensionDefs = schema.definitions.filter((def) => def.kind === Kind.TYPE_EXTENSION_DEFINITION);
  if( extensionDefs.length > 0 )
    schemaAST = extendSchema(schemaAST, {...schema, definitions:extensionDefs});

  let document;
  if( inputPaths.length > 0 )
    document = loadAndMergeQueryDocuments(inputPaths, tagName);
  else
    document = createDocumentFromServerSchema(schema, schemaAST);

  validateQueryDocument(schemaAST, document, target);

  if (target === 'swift') {
    options.addTypename = true;
  }

  const context = compileToIR(schemaAST, <DocumentNode>document, options);

  let output = '';
  switch (target) {
    case 'json':
      output = serializeToJSON(context);
      break;
    case 'ts':
    case 'typescript':
      output = generateTypescriptSource(context, options);
      break;
    case 'flow':
      output = generateFlowSource(context, options);
      break;
    case 'swift':
      output = generateSwiftSource(context, options);
      break;
  }

  if (outputPath) {
    fs.writeFileSync(outputPath, output);
  } else {
    console.log(output);
  }

  if (options.generateOperationIds) {
    writeOperationIdsMap(context)
  }
}

interface OperationIdsMap {
  name: string,
  source: string
}

function writeOperationIdsMap(context: any) {
  let operationIdsMap: { [id: string]: OperationIdsMap } = {};
  Object.values(context.operations).forEach(operation => {
    operationIdsMap[operation.operationId] = {
      name: operation.operationName,
      source: operation.sourceWithFragments
    };
  });
  fs.writeFileSync(context.operationIdsPath, JSON.stringify(operationIdsMap, null, 2));
}


function createDocumentFromServerSchema(schema:DocumentNode, schemaAST: GraphQLSchema) : DocumentNode | null {
  let operations: any[] = [];

  [{type:"query", ast: [((<any>schemaAST.getQueryType())||{}).astNode]
    .concat(((<any>schemaAST.getQueryType())||{}).extensionASTNodes || [])},
    {type:"mutation", ast: [((<any>schemaAST.getMutationType())||{}).astNode]
      .concat(((<any>schemaAST.getMutationType()||{}).extensionASTNodes || []))},
    {type:"subscription", ast: [((<any>schemaAST.getSubscriptionType())||{}).astNode]
      .concat(((<any>schemaAST.getSubscriptionType()||{}).extensionASTNodes || []))}]
    .forEach((operationType: any) => {
      operationType.ast.filter((x:any)=> !!x)
        .forEach((def: any) => {
          if (def.kind === Kind.TYPE_EXTENSION_DEFINITION) {
            def = def.definition;
          }

          def.fields.forEach((operationDef: any) => {
            let operation;
            operation = createClientOperationFromSchema(operationType.type, operationDef, schema);
            operations.push(operation);
          });

        });
    });
  return withTypenameFieldAddedWhereNeeded(schemaAST, concatAST(operations.map(operation => parse(operation))));
}

function createClientOperationFromSchema(type:string, def:any, schema:DocumentNode) : string {
  const operation = def;
  let paramDefs: any[] = [];
  let argDefs: any[] = [];
  let x : (number|null)[];
  if (operation.arguments.length > 0) {
    operation.arguments.forEach((arg: any) => {
      argDefs.push("$" + arg.name.value + ":" + getNamedTypeString(arg.type, false));
      paramDefs.push(arg.name.value + ":$" + arg.name.value);
    });
  }

  let fields: any[] = getFields(operation.type, schema);

  const clientOperation = type + " " + operation.name.value +
    (argDefs.length > 0 ? "(" + argDefs.join(",") + ")":"") +
    "{" + operation.name.value +  (paramDefs.length > 0 ? "(" + paramDefs.join(",") + ")" : "") +
    (fields.length > 0 ? "{" + fields.join(",") + "}":"") + "}";
  return clientOperation;
}

function getFields(type:any, schema:DocumentNode): string[] {
  if( type.kind !== Kind.NAMED_TYPE ) {
    if (type.type){
      return getFields(type.type, schema);
    }
    else throw new ToolError("Expected " + Kind.NAMED_TYPE + ". Found " + type.kind);
  }

  let fields: string[] = [];
  schema.definitions
    .filter((def: any) => {
      if (def.kind === Kind.TYPE_EXTENSION_DEFINITION) {
        def = def.definition;
      }

      const typeName = getNamedTypeString(type, true);
      if((def.kind === Kind.OBJECT_TYPE_DEFINITION || def.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION) &&
        def.name.value === typeName) {
        return true;
      }
      return false;
    })
    .map((def: any) => {
      if (def.kind === Kind.TYPE_EXTENSION_DEFINITION) {
        def = def.definition;
      }
      def.fields.forEach((field: any) => {
        if( field.type.kind !== Kind.NAMED_TYPE) {
          const f:any[] = getFields(field.type.type, schema);
          if( f.length > 0 )
            fields.push(field.name.value + "{" + f.join(",") + "}");
          else fields.push(field.name.value);
        }
        else fields.push(field.name.value);
      });
    });
  return fields;
}
