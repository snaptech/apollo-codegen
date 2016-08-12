import {
  join,
  block,
  wrap,
  indent
} from '../utilities/printing.js';

import { camelCase } from 'change-case';

import { GraphQLEnumType } from 'graphql';

import { propertiesFromSelectionSet, typeNameFromGraphQLType } from './mapping'

export function generateSourceForQueryDefinition(queryDefinition) {
  return importDeclarations() + '\n\n' + classDefinition(queryDefinition) + '\n';
}

function importDeclarations() {
  return 'import Apollo';
}

function classDefinition({ source, name, variableDefinitions, selectionSet }) {
  const properties = propertiesFromSelectionSet(selectionSet);

  return `public class ${name}Query: GraphQLQuery ` +
    block([
      wrap('', instancePropertyDeclarations(variableDefinitions), '\n'),
      initializerDeclaration(variableDefinitions),
      wrap('\n', operationDefinition(source)),
      wrap('\n', variablesProperty(variableDefinitions)),
      wrap('\n', structDeclaration({ name: "Data", properties }))]);
}

function instancePropertyDeclarations(variableDefinitions = []) {
  return join(variableDefinitions.map(variable => {
    return `public let ${variable.name}: ${typeNameFromGraphQLType(variable.type)}`;
  }), '\n');
}

function initializerDeclaration(variableDefinitions = []) {
  const initializationParameters = join(variableDefinitions.map(variable => {
    return `${variable.name}: ${typeNameFromGraphQLType(variable.type)}`;
  }), ', ');

  const propertyInitializations = variableDefinitions.map(variable => {
    return `self.${variable.name} = ${variable.name}`;
  });

  return `public init(${initializationParameters}) ` + block(propertyInitializations);
}

function variablesProperty(variableDefinitions = []) {
  if (variableDefinitions.length < 1) return null;

  const variablesMap = wrap(`return [`, join(variableDefinitions.map(variable => {
    return `"${variable.name}": ${variable.name}`;
  }), ', '), `]`);

  return 'public var variables: GraphQLMap? ' + block([variablesMap]);
}

function operationDefinition(source) {
  return `public let operationDefinition =
  ${indent(multilineString(source))}`
}

function structDeclaration({ name, properties = [] }) {
  const propertyDeclarations = properties.map(propertyDeclaration);

  const initializerDeclaration = `public init(map: GraphQLMap) throws ` +
    block(properties.map(property =>
      `${property.name} = try map.${ property.isList ? 'list' : 'value' }(forKey: "${property.fieldName}")`));

  const compositeProperties = properties.filter(property => property.isComposite);
  const nestedStructDeclarations = compositeProperties.map(property => structDeclaration(property.typeDeclaration) );

  return `public struct ${name}: GraphQLMapConvertible ` +
    block([
      wrap('', join(propertyDeclarations, '\n'), '\n'),
      initializerDeclaration,
      wrap('\n', join(nestedStructDeclarations, '\n'), '')
    ]);
}

function propertyDeclaration({ name, typeName }) {
  return `public let ${name}: ${typeName}`;
}

function multilineString(string) {
  const lines = string.split('\n');
  return lines.map((line, index) => {
    const isLastLine = index != lines.length - 1;
    return `"${line}"` + (isLastLine ? ' +' : '');
  }).join('\n');
}

export function generateSourceForTypes(types) {
  const typeDeclarations = types.map(type => {
    if (type instanceof GraphQLEnumType) {
      return enumerationDeclaration(type);
    }
  });
  return importDeclarations() + '\n' + join(typeDeclarations, '\n');
}

function enumerationDeclaration(type) {
  const { name, description } = type;
  const values = type.getValues();

  const caseDeclarations = values.map(value => `case ${camelCase(value.name)} = "${value.value}"`);

  return join([
    '\n',
    description && `/// ${description}\n`,
    `public enum ${name}: String `,
    block(caseDeclarations),
    '\n\n',
    `extension ${name}: JSONDecodable, JSONEncodable {}`
  ]);
}