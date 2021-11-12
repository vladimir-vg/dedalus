Top = items:ToplevelItem* {
	// remove whitespace null values
	return items.filter(function (x) { return x != null; });
}

ToplevelItem = ToSkip / Fact / Rule

ToSkip
	= (Comment / WhiteSpace)+ { return null; }

Rule = RuleWithBody / RuleWithoutBody
RuleWithBody = head:RuleHead suffix: SuffixAndArrow ToSkip? body:RuleBody WhiteSpace? ";" {
	return {
    	Rule: {
    		name: head['name'], args: head['args'],
            body: body, suffix: suffix
    	}
    };
}
SuffixAndArrow
	= suffix:"@next" WhiteSpace? "<-" { return suffix; }
    / suffix:"@async" WhiteSpace? "<-" { return suffix; }
    / WhiteSpace? "<-" { return null; }
RuleWithoutBody = head:RuleHead ";" {
	return { Rule: { name: head['name'], args: head['args'], body: [], suffix: null } };
}
RuleHead = RuleHeadWithArgs / RuleHeadWithoutArgs
RuleHeadWithoutArgs = name:Atom { return { name: name['Atom'], args: [] } }
RuleHeadWithArgs = name:Atom "(" WhiteSpace? args:Arguments WhiteSpace? ")" {
	return { name: name['Atom'], args: args };
}
RuleBody
	= cond:RuleCondition WhiteSpace? "," ToSkip? rest:RuleBody { return [cond].concat(rest); }
	/ cond:RuleCondition { return [cond]; }
RuleCondition = FactCondition / OperatorCondition

OperatorCondition = left:NumValue WhiteSpace? op:Operator WhiteSpace? right:NumValue {
	return {OperatorCondition: {left: left, op: op, right: right}};
}
// FactConditionWithArgs /
FactCondition = FactConditionWithoutArgs
FactConditionWithoutArgs = FactConditionWithoutArgsWithTime / FactConditionWithoutArgsAndTime
FactConditionWithoutArgsWithTime = name:Atom "@" time:NonNegNumValue {
	return { name: name['Atom'], time: time, args: [] };
}
FactConditionWithoutArgsAndTime = name:Atom { return { name: name['Atom'], time: null, args: [] } }


Fact = FactWithArgs / FactWithoutArgs
FactWithoutArgs
	= name:Atom "@" time:NonNegInteger WhiteSpace? ";" {
    	return { Fact: { name: name['Atom'], args: [], time: time } }
    }
FactWithArgs
	= name:Atom "("  WhiteSpace? args:ConstArguments WhiteSpace? ")"
      "@" time:NonNegInteger WhiteSpace? ";" {
      	const args1 = args.filter(function (x) { return x != null; });
    	return { Fact: {name: name['Atom'], args: args1, time: time } };
    }

Arguments
	= arg:Argument WhiteSpace? "," WhiteSpace? rest:Arguments { return [arg].concat(rest); }
    / arg:Argument { return [arg]; }
Argument
	= AggregatedVariable / Constant / Variable

ConstArguments
	= arg:Constant WhiteSpace? "," WhiteSpace? rest:ConstArguments { return [arg].concat(rest); }
    / arg:Constant { return [arg]; }

Constant = Integer / String / Atom
Integer = [-+]?[0-9]+ { return parseInt(text(), 10); }
String = "\"" content:([^"]*) "\"" { return {String: content.join('') }; }
NumValue = Integer / Variable
NonNegNumValue = NonNegInteger / Variable

NonNegInteger "integer"
	= ([0-9]+) { return parseInt(text(), 10); }

Atom = AtomAlphanumeric / AtomQuoted
AtomAlphanumeric
	= head:[a-z] tail:[a-zA-Z0-9_]* { return { Atom: (head + tail.join('')) }; }
AtomQuoted
	= "'" content:[^']+ "'" { return { Atom: content.join('') }; }

Variable = head:[A-Z_] tail:[a-zA-Z0-9_]* { return { Variable: (head + tail.join('')) }; }
Operator = ">=" / "=<" / ">" / "<" / "=/=" / "=" { return text(); }

AggregatedVariable = func:Atom "<" name:Variable ">" {
	return { AggregatedVariable: { name: name['Variable'], func: func['Atom'] } };
}


SourceCharacter = .

WhiteSpace "whitespace" = WhiteSpaceChar+ { return null; }
WhiteSpaceChar = "\t" / "\v" / "\f" / " " / LineTerminator
Comment "comment" = MultiLineComment / SingleLineComment
MultiLineComment = "/*" (!"*/" SourceCharacter)* "*/"
SingleLineComment = "%" (!LineTerminator SourceCharacter)*

LineTerminator = [\n\r]

