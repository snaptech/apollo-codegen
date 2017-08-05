import {
  join,
  block,
  wrap,
  indent
} from '../utilities/printing';

import { camelCase } from 'change-case';

import {
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLID,
  GraphQLList,
  GraphQLNonNull,
  GraphQLScalarType,
  GraphQLEnumType,
  Kind
} from 'graphql';
import {ToolError} from "../errors";

const builtInScalarMap = {
  [GraphQLString.name]: 'string',
  [GraphQLInt.name]: 'number',
  [GraphQLFloat.name]: 'number',
  [GraphQLBoolean.name]: 'boolean',
  [GraphQLID.name]: 'string',
}

export function typeNameFromGraphQLType(context, type, bareTypeName, nullable = true) {
  if (type instanceof GraphQLNonNull) {
    return typeNameFromGraphQLType(context, type.ofType, bareTypeName, false)
  }

  let typeName;
  if (type instanceof GraphQLList) {
    typeName = `Array<${typeNameFromGraphQLType(context, type.ofType, bareTypeName, true)}>`;
  } else if (type instanceof GraphQLScalarType) {
    typeName = builtInScalarMap[type.name] || (context.passthroughCustomScalars ? context.customScalarsPrefix + type.name: builtInScalarMap[GraphQLString.name]);
  } else {
    typeName = bareTypeName || type.name;
  }

  return nullable ? typeName + ' | null' : typeName;
}

export function getTypeString(type, parentType) {
  if (type.kind === Kind.LIST_TYPE) {
    return 'Array<' + getTypeString(type.type, type) + (type.type.kind !== Kind.NON_NULL_TYPE ? ' | null':'') + '>';
  }
  else if( type.kind === Kind.NON_NULL_TYPE ) {
    return getTypeString(type.type, type);
  }
  else if(type.kind === Kind.NAMED_TYPE) {
    return (builtInScalarMap[type.name.value] || type.name.value) +
      ((parentType||{}).kind !== Kind.NON_NULL_TYPE ? ' | null':'');
  }
  else throw new ToolError("Cannot generate type string [" + type.toString() + "]");
}
