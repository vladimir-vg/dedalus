Top = items:ToplevelItem* {
	// remove whitespace null values
	return items.filter(function (x) { return x != null; });
}

ToplevelItem = ToSkip / Atom / Rule

ToSkip
	= (Comment / WhiteSpace)+ { return null; }

Rule "rule" = RuleWithBody / RuleWithoutBody
RuleWithBody = head:RuleHead suffix:SuffixAndArrow ToSkip? body:RuleBody WhiteSpace? ";" {
	return {
    	Rule: {
    		name: head['name'], args: head['args'],
            body: body, suffix: suffix,
            line: location().start.line
    	}
    };
}
SuffixAndArrow
	= suffix:"@next" WhiteSpace? ":-" { return suffix; }
    / suffix:"@async" WhiteSpace? ":-" { return suffix; }
    / WhiteSpace? ":-" { return null; }
RuleWithoutBody = head:RuleHead ";" {
	return {
    	Rule: {
    		name: head['name'], args: head['args'], body: [], suffix: null,
            line: location().start.line
    	}
    };
}
RuleHead = RuleHeadWithArgs / RuleHeadWithoutArgs
RuleHeadWithoutArgs = name:Symbol { return { name: name['symbol'], args: [] } }
RuleHeadWithArgs = name:Symbol "(" WhiteSpace? args:HeadArguments WhiteSpace? ")" {
	return { name: name['symbol'], args: args };
}
RuleBody
	= cond:BodyExpr WhiteSpace? "," ToSkip? rest:RuleBody { return [cond].concat(rest); }
	/ cond:BodyExpr { return [cond]; }
BodyExpr = ChooseExpr / BodyAtomExpr / BinaryPredicateExpr

ChooseExpr
	= "choose(" WhiteSpace? "(" keyvars:VarList ")" WhiteSpace? ","
      WhiteSpace? "(" rowvars:VarList ")" WhiteSpace? ")" {
      	const line = location().start.line;
      	return { ChooseExpr: { keyvars: keyvars, rowvars: rowvars, line: line } };
      }
VarList = var1:VariableWithoutLocPrefix WhiteSpace? "," WhiteSpace? rest:VarList {
			return [var1].concat(rest);
		  }
		/ var1:VariableWithoutLocPrefix { return [var1]; }

BinaryPredicateExpr = left:Value WhiteSpace? op:Operator WhiteSpace? right:Value {
	const line = location().start.line;
    return { BinaryPredicateExpr: {left: left, op: op, right: right, line: line} };
}

BodyAtomExpr
	= "notin" WhiteSpace atom:BodyAtomExpr1 {
    	const line = location().start.line;
    	return {
        BodyAtomExpr: { ...atom['BodyAtomExpr'], negated: true, line: line }
      };
    }
    / atom:BodyAtomExpr1 {
    	const line = location().start.line;
    	return {
        BodyAtomExpr: { ...atom['BodyAtomExpr'], negated: false, line: line }
      };
    }
BodyAtomExpr1
	= name:Symbol "(" args:BodyArguments ")" "@" time:IntegerValue {
    	return { BodyAtomExpr: { name: name, args: args, time: time } };
    }
    / name:Symbol "(" args:BodyArguments ")" {
    	return { BodyAtomExpr: { name: name, args: args, time: null } };
    }
    / name:Symbol "@" time:IntegerValue {
    	return { BodyAtomExpr: { name: name, args: [], time: time } };
    }
    / name:Symbol {
    	return { BodyAtomExpr: { name: name, args: [], time: null } };
    }


Atom "Atom" = AtomWithArgs / AtomWithoutArgs
AtomWithoutArgs
	= name:Symbol "@" time:Integer WhiteSpace? ";" {
    	return { Atom: { name: name['symbol'], args: [], time: time, line: location().start.line } }
    }
AtomWithArgs
	= name:Symbol "("  WhiteSpace? args:ConstArguments WhiteSpace? ")"
      "@" time:Integer WhiteSpace? ";" {
      	const args1 = args.filter(function (x) { return x != null; });
    	return { Atom: {name: name['symbol'], args: args1, time: time, line: location().start.line } };
    }

HeadArguments
	= arg:HeadArgument WhiteSpace? "," WhiteSpace? rest:HeadArguments { return [arg].concat(rest); }
    / arg:HeadArgument { return [arg]; }
HeadArgument
	= AggregatedVariable / Constant / Variable

BodyArguments
	= arg:BodyArgument WhiteSpace? "," WhiteSpace? rest:BodyArguments { return [arg].concat(rest); }
    / arg:BodyArgument { return [arg]; }
BodyArgument
	= Constant / Variable

ConstArguments
	= arg:Constant WhiteSpace? "," WhiteSpace? rest:ConstArguments { return [arg].concat(rest); }
    / arg:Constant { return [arg]; }
Constant = Integer / String / Symbol

Integer = [-+]?[0-9]+ { return parseInt(text(), 10); }
String "string" = "\"" content:([^"]*) "\"" { return {string: content.join('')}; }
IntegerValue = Integer / VariableWithoutLocPrefix
Value = Integer / String / Symbol / VariableWithoutLocPrefix

Symbol "symbol" = SymbolAlphanumeric / SymbolQuoted
SymbolAlphanumeric
	= head:[a-z] tail:[a-zA-Z0-9_]* { return { symbol: (head + tail.join('')) }; }
SymbolQuoted
	= "'" content:[^']+ "'" { return { symbol: content.join('') }; }

Variable "variable" = loc:"#"? head:[A-Z_] tail:[a-zA-Z0-9_]* {
	return { Variable: { name: (head + tail.join('')), location: !!loc } };
}
VariableWithoutLocPrefix "variable" = head:[A-Z_] tail:[a-zA-Z0-9_]* {
	return { Variable: { name: (head + tail.join('')), location: false } };
}
Operator "binary operator" = ">=" / "=<" / ">" / "<" / "=/=" / "=" { return text(); }

AggregatedVariable = func:Symbol "<" name:Variable ">" {
	return { Variable: { name: name['Variable']['name'], afunc: func['symbol'], location: false } };
}


SourceCharacter = .

WhiteSpace "whitespace" = WhiteSpaceChar+ { return null; }
WhiteSpaceChar = "\t" / "\v" / "\f" / " " / LineTerminator
Comment "comment" = MultiLineComment / SingleLineComment
MultiLineComment = "/*" (!"*/" SourceCharacter)* "*/"
SingleLineComment = ("//" / "%") (!LineTerminator SourceCharacter)*

LineTerminator = [\n\r]

