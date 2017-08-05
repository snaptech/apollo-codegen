import {
  join,
  wrap,
} from '../utilities/printing';

import { propertyDeclarations } from './codeGeneration';
import {getTypeString, typeNameFromGraphQLType} from './types';

import { pascalCase } from 'change-case';
import {getNamedTypeString} from "../utilities/graphql";
import { Kind } from "graphql";

export function interfaceDeclaration(generator, { interfaceName, noBrackets }, closure) {
  generator.printNewlineIfNeeded();
  generator.printNewline();

  if( generator.options.pascalCase )
    interfaceName = pascalCase(interfaceName);

  if( generator.options.preferInterfaces )
    generator.print(`export interface ${ interfaceName } `);
  else
    generator.print(`export type ${ interfaceName } = `);


  generator.pushScope({ typeName: interfaceName });
  if (noBrackets) {
    generator.withinBlock(closure, '', '');
  } else {
    generator.withinBlock(closure, '{', '}');
  }
  generator.popScope();
  generator.print(';');
}



export function operationDeclaration(generator, {
  operation,
  returnType,
  fullReturnType
}) {
  generator.pushScope({ typeName: operation.name.value });
  generator.printOnNewline(operation.name.value);
  if (operation.arguments.length > 0) {
    let argDefs = [];
    operation.arguments.forEach((arg) => {
      argDefs.push(arg.name.value + ":" + getTypeString(arg.type));
    });
    generator.print(`(${argDefs.join(',')})`);
  }
  if( returnType ) {
    generator.print(` : ${typeNameFromGraphQLType(generator.context, returnType)}`);
  }
  generator.popScope();
}

export function propertyDeclaration(generator, {
  fieldName,
  type,
  propertyName,
  typeName,
  description,
  isInput,
  isArray,
  isNullable,
  isArrayElementNullable,
  fragmentSpreads
}, closure) {
  const name = fieldName || propertyName;

  if (description) {
    description.split('\n')
      .forEach(line => {
        generator.printOnNewline(`// ${line.trim()}`);
      })
  }

  if (closure) {
    generator.printOnNewline(name);

    if (isNullable && isInput) {
      generator.print('?');
    }
    generator.print(': ');

    if (isArray) {
      generator.print(' Array<');
    }
    generator.pushScope({ typeName: name });

    generator.withinBlock(closure);

    generator.popScope();

    if (isArray) {
      if (isArrayElementNullable) {
        generator.print(' | null');
      }
      generator.print(' >');
    }

    if (isNullable) {
      generator.print(' | null');
    }

  } else {
    generator.printOnNewline(name);
    if (isInput && isNullable) {
      generator.print('?')
    }
    generator.print(`: ${typeName || typeNameFromGraphQLType(generator.context, type)}`);
  }
  generator.print(',');
}

export function propertySetsDeclaration(generator, property, propertySets, standalone = false) {
  const {
    description, fieldName, propertyName, typeName,
    isNullable, isArray, isArrayElementNullable,
  } = property;
  const name = fieldName || propertyName;

  if (description) {
    description.split('\n')
      .forEach(line => {
        generator.printOnNewline(`// ${line.trim()}`);
      })
  }

  if (!standalone) {
    generator.printOnNewline(`${name}: `);
  }

  if (isArray) {
    generator.print(' Array<');
  }

  generator.pushScope({ typeName: name });

  generator.withinBlock(() => {
    propertySets.forEach((propertySet, index, propertySets) => {
      generator.withinBlock(() => {
        propertyDeclarations(generator, propertySet);
      });
      if (index !== propertySets.length - 1) {
        generator.print(' |');
      }
    })
  }, '(', ')');

  generator.popScope();

  if (isArray) {
    if (isArrayElementNullable) {
      generator.print(' | null');
    }
    generator.print(' >');
  }

  if (isNullable) {
    generator.print(' | null');
  }

  if (!standalone) {
    generator.print(',');
  }
}
