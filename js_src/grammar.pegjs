Top = items:ToplevelItem* {
	// remove whitespace null values
	return items.filter(function (x) { return x != null; });
}

ToplevelItem = ToSkip / Fact / Rule

ToSkip
	= (Comment / WhiteSpace)+ { return null; }

Rule "rule" = RuleWithBody / RuleWithoutBody
RuleWithBody = head:RuleHead suffix: SuffixAndArrow ToSkip? body:RuleBody WhiteSpace? ";" {
	return {
    	Rule: {
    		name: head['name'], args: head['args'],
            body: body, suffix: suffix,
            line: location().start.line
    	}
    };
}
SuffixAndArrow
	= suffix:"@next" WhiteSpace? "<-" { return suffix; }
    / suffix:"@async" WhiteSpace? "<-" { return suffix; }
    / WhiteSpace? "<-" { return null; }
RuleWithoutBody = head:RuleHead ";" {
	return {
    	Rule: {
    		name: head['name'], args: head['args'], body: [], suffix: null,
            line: location().start.line
    	}
    };
}
RuleHead = RuleHeadWithArgs / RuleHeadWithoutArgs
RuleHeadWithoutArgs = name:Atom { return { name: name['Atom'], args: [] } }
RuleHeadWithArgs = name:Atom "(" WhiteSpace? args:HeadArguments WhiteSpace? ")" {
	return { name: name['Atom'], args: args };
}
RuleBody
	= cond:RuleCondition WhiteSpace? "," ToSkip? rest:RuleBody { return [cond].concat(rest); }
	/ cond:RuleCondition { return [cond]; }
RuleCondition = ChooseCondition / FactCondition / OperatorCondition

ChooseCondition
	= "choose(" WhiteSpace? "(" keyvars:VarList ")" WhiteSpace? ","
      WhiteSpace? "(" rowvars:VarList ")" WhiteSpace? ")" {
      	const line = location().start.line;
      	return { ChooseCondition: { keyvars: keyvars, rowvars: rowvars, line: line } };
      }
VarList = var1:VariableWithoutLocPrefix WhiteSpace? "," WhiteSpace? rest:VarList {
			return [var1].concat(rest);
		  }
		/ var1:VariableWithoutLocPrefix { return [var1]; }

OperatorCondition = left:IntegerValue WhiteSpace? op:Operator WhiteSpace? right:IntegerValue {
	const line = location().start.line;
    return { OperatorCondition: {left: left, op: op, right: right, line: line} };
}

FactCondition
	= "notin" WhiteSpace fact:FactCondition1 {
    	const line = location().start.line;
    	return {
        FactCondition: { ...fact['FactCondition'], negated: true, line: line }
      };
    }
    / fact:FactCondition1 {
    	const line = location().start.line;
    	return {
        FactCondition: { ...fact['FactCondition'], negated: false, line: line }
      };
    }
FactCondition1
	= name:Atom "(" args:BodyArguments ")" "@" time:IntegerValue {
    	return { FactCondition: { name: name, args: args, time: time } };
    }
    / name:Atom "(" args:BodyArguments ")" {
    	return { FactCondition: { name: name, args: args, time: null } };
    }
    / name:Atom "@" time:IntegerValue {
    	return { FactCondition: { name: name, args: [], time: time } };
    }
    / name:Atom {
    	return { FactCondition: { name: name, args: [], time: null } };
    }


Fact "fact" = FactWithArgs / FactWithoutArgs
FactWithoutArgs
	= name:Atom "@" time:Integer WhiteSpace? ";" {
    	return { Fact: { name: name['Atom'], args: [], time: time, line: location().start.line } }
    }
FactWithArgs
	= name:Atom "("  WhiteSpace? args:ConstArguments WhiteSpace? ")"
      "@" time:Integer WhiteSpace? ";" {
      	const args1 = args.filter(function (x) { return x != null; });
    	return { Fact: {name: name['Atom'], args: args1, time: time, line: location().start.line } };
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
Constant = Integer / String / Atom

Integer = [-+]?[0-9]+ { return parseInt(text(), 10); }
String "string" = "\"" content:([^"]*) "\"" { return {String: content.join('') }; }
IntegerValue = Integer / VariableWithoutLocPrefix

Atom "atom" = AtomAlphanumeric / AtomQuoted
AtomAlphanumeric
	= head:[a-z] tail:[a-zA-Z0-9_]* { return { Atom: (head + tail.join('')) }; }
AtomQuoted
	= "'" content:[^']+ "'" { return { Atom: content.join('') }; }

Variable "variable" = loc:"#"? head:[A-Z_] tail:[a-zA-Z0-9_]* {
	return { Variable: { name: (head + tail.join('')), location: !!loc } };
}
VariableWithoutLocPrefix "variable" = head:[A-Z_] tail:[a-zA-Z0-9_]* {
	return { Variable: { name: (head + tail.join('')), location: false } };
}
Operator "binary operator" = ">=" / "=<" / ">" / "<" / "=/=" / "=" { return text(); }

AggregatedVariable = func:Atom "<" name:Variable ">" {
	return { Variable: { name: name['Variable'], afunc: func['Atom'], location: false } };
}


SourceCharacter = .

WhiteSpace "whitespace" = WhiteSpaceChar+ { return null; }
WhiteSpaceChar = "\t" / "\v" / "\f" / " " / LineTerminator
Comment "comment" = MultiLineComment / SingleLineComment
MultiLineComment = "/*" (!"*/" SourceCharacter)* "*/"
SingleLineComment = ("//" / "%") (!LineTerminator SourceCharacter)*

LineTerminator = [\n\r]

