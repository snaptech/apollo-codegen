import {
  visit,
  visitWithTypeInfo,
  Kind,
  TypeInfo,
  isEqualType,
  isTypeSubTypeOf,
  isAbstractType,
  SchemaMetaFieldDef,
  TypeMetaFieldDef,
  TypeNameMetaFieldDef,
  GraphQLCompositeType,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLUnionType,
  GraphQLEnumType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLID,
  GraphQLError,
  GraphQLSchema,
  GraphQLType,
  GraphQLScalarType,
  ASTNode,
  SelectionSetNode,
  Location,
  ValueNode,
  IntValueNode,
  FloatValueNode,
  OperationDefinitionNode,
  FieldNode,
  GraphQLField,
} from 'graphql';

import {ToolError} from "../errors";


const builtInScalarTypes = new Set([GraphQLString, GraphQLInt, GraphQLFloat, GraphQLBoolean, GraphQLID]);

export function isBuiltInScalarType(type: GraphQLScalarType) {
  return builtInScalarTypes.has(type);
}

const typenameField = { kind: Kind.FIELD, name: { kind: Kind.NAME, value: '__typename' } };

export function withTypenameFieldAddedWhereNeeded(schema: GraphQLSchema, ast: ASTNode) {
  function isOperationRootType(type: GraphQLType) {
    return type === schema.getQueryType() ||
      type === schema.getMutationType() ||
      type === schema.getSubscriptionType();
  }

  const typeInfo = new TypeInfo(schema);

  return visit(ast, visitWithTypeInfo(typeInfo, {
    leave: {
      SelectionSet: (node: SelectionSetNode) => {
        const parentType = typeInfo.getParentType();

        if (!isOperationRootType(parentType)) {
          return { ...node, selections: [typenameField, ...node.selections] };
        } else {
          return undefined;
        }
      }
    }
  }));
}

export function sourceAt(location: Location) {
  return location.source.body.slice(location.start, location.end);
}

export function filePathForNode(node: ASTNode): string | undefined {
  const name = node.loc && node.loc.source && node.loc.source.name;
  return (name === "GraphQL") ? undefined : name;
}

export function valueFromValueNode(valueNode: ValueNode): any {
  switch (valueNode.kind) {
    case 'IntValue':
    case 'FloatValue':
      return Number(valueNode.value);
    case 'NullValue':
      return null;
    case 'ListValue':
      return valueNode.values.map(valueFromValueNode);
    case 'ObjectValue':
      return valueNode.fields.reduce((object, field) => {
        object[field.name.value] = valueFromValueNode(field.value);
        return object;
      }, {} as any);
    case 'Variable':
      return { kind: 'Variable', variableName: valueNode.name.value };
    default:
      return valueNode.value;
  }
}

export function isTypeProperSuperTypeOf(schema: GraphQLSchema, maybeSuperType: GraphQLCompositeType, subType: GraphQLCompositeType) {
  return isEqualType(maybeSuperType, subType) || subType instanceof GraphQLObjectType && (isAbstractType(maybeSuperType) && schema.isPossibleType(maybeSuperType, subType));
}

// Utility functions extracted from graphql-js

/**
 * Extracts the root type of the operation from the schema.
 */
export function getOperationRootType(schema: GraphQLSchema, operation: OperationDefinitionNode) {
  switch (operation.operation) {
    case 'query':
      return schema.getQueryType();
    case 'mutation':
      const mutationType = schema.getMutationType();
      if (!mutationType) {
        throw new GraphQLError(
          'Schema is not configured for mutations',
          [operation]
        );
      }
      return mutationType;
    case 'subscription':
      const subscriptionType = schema.getSubscriptionType();
      if (!subscriptionType) {
        throw new GraphQLError(
          'Schema is not configured for subscriptions',
          [operation]
        );
      }
      return subscriptionType;
    default:
      throw new GraphQLError(
        'Can only compile queries, mutations and subscriptions',
        [operation]
      );
  }
}

/**
 * Not exactly the same as the executor's definition of getFieldDef, in this
 * statically evaluated environment we do not always have an Object type,
 * and need to handle Interface and Union types.
 */
export function getFieldDef(schema: GraphQLSchema, parentType: GraphQLCompositeType, fieldAST: FieldNode): GraphQLField<any, any> | undefined {
  const name = fieldAST.name.value;
  if (name === SchemaMetaFieldDef.name &&
      schema.getQueryType() === parentType) {
    return SchemaMetaFieldDef;
  }
  if (name === TypeMetaFieldDef.name &&
      schema.getQueryType() === parentType) {
    return TypeMetaFieldDef;
  }
  if (name === TypeNameMetaFieldDef.name &&
      (parentType instanceof GraphQLObjectType ||
       parentType instanceof GraphQLInterfaceType ||
       parentType instanceof GraphQLUnionType)
  ) {
    return TypeNameMetaFieldDef;
  }
  if (parentType instanceof GraphQLObjectType ||
      parentType instanceof GraphQLInterfaceType) {
    return parentType.getFields()[name];
  }

  return undefined;
}

export function getNamedTypeString(type:any, baseName:boolean = false) :string {
  if (type.kind === Kind.LIST_TYPE) {
    return baseName ? getNamedTypeString(type.type, baseName) : '[' + getNamedTypeString(type.type, baseName) + ']';
  }
  else if( type.kind === Kind.NON_NULL_TYPE ) {
    return getNamedTypeString(type.type, baseName) + "!";
  }
  else if(type.kind === Kind.NAMED_TYPE) {
    return type.name.value;
  }
  else return ""; //throw new ToolError("Cannot find type name [" + type.toString() + "]");
}

/**
 * Extracts the operation return type from the schema.
 */
export function getOperationSchemaDef(schema:GraphQLSchema, operationTypeName:string) {
  if( !schema )
    throw new ToolError("schema parameter is required");
  else if( !operationTypeName )
    throw new ToolError("operationTypeName parameter is required");

  let returnType = null;
  let operations =
    [(<any>schema.getQueryType()||{}).astNode,
      (<any>schema.getMutationType()||{}).astNode,
      (<any>schema.getSubscriptionType()||{}).astNode]
      .concat((<any>schema.getQueryType()||{}).extensionASTNodes||[])
      .concat((<any>schema.getMutationType()||{}).extensionASTNodes || [])
      .concat((<any>schema.getSubscriptionType()||{}).extensionASTNodes || [])
      .filter(x=>!!x);

  //nested for loops are used for efficiency over .forEach since there may be a lot of operations/fields
  for( const operation in operations ) {
    let def = operations[operation];
    if (def.kind === Kind.TYPE_EXTENSION_DEFINITION) {
      def = def.definition;
    }

    for (const field in def.fields) {
      const operationDef = def.fields[field];
      if (operationDef.name.value === operationTypeName) {
        let namedType = getNamedTypeString(operationDef.type, true);
        returnType = {
          operation: operationDef,
          returnType: schema.getTypeMap()[namedType],
          fullReturnType : operationDef.type
        };
        break;
      }
    }
    if( returnType ) break;
  };
  return returnType;
}
