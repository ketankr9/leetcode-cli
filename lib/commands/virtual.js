'use strict';
var _ = require('underscore');
var lodash = require('lodash');
var util = require('util');
var request = require('request');
var async = require('async');

var h = require('../helper');
var file = require('../file');
var chalk = require('../chalk');
var log = require('../log');
var core = require('../core');
var session = require('../session');
var config = require('../config');
var icon = require('../icon');

const cmd = {
  command: 'virtual <contestname>',
  aliases: ['virtual'],
  desc: 'Start Virtual Contest',
  builder: function (yargs) {
    return yargs
      .option('a', {
        alias: 'start',
        type: 'boolean',
        default: false,
        describe: 'Start Contest'
      })
      .option('b', {
        alias: 'end',
        type: 'boolean',
        default: false,
        describe: 'End Contest'
      })
      .option('r', {
        alias: 'myrank',
        type: 'boolean',
        default: false,
        describe: 'Get MyRank'
      })
      .option('v', {
        alias: 'view',
        type: 'boolean',
        default: false,
        describe: 'View all questions'
      })
      .option('f', {
        alias: 'filename',
        type: 'string',
        default: '',
        describe: 'File Name To Run/Submit'
      })
      .option('t', {
        alias: 'testcase',
        type: 'string',
        default: '',
        describe: 'Provide test case'
      })
      .option('s', {
        alias: 'submit',
        type: 'boolean',
        default: false,
        describe: 'Submit Problem'
      })
      .option('q', {
        alias: 'question',
        type: 'number',
        default: -1,
        describe: 'Show Question by Serial No [0,3]'
      })
      .option('e', {
        alias: 'editor',
        type: 'string',
        default: '',
        describe: 'Open source code in editor'
      })
      .option('g', {
        alias: 'gen',
        type: 'boolean',
        default: false,
        describe: 'Generate source code'
      })
      .option('o', {
        alias: 'outdir',
        type: 'string',
        describe: 'Where to save source code',
        default: '.'
      })
      .option('x', {
        alias: 'extra',
        type: 'boolean',
        default: false,
        describe: 'Show extra question details in source code'
      })
      .option('l', {
        alias: 'lang',
        type: 'string',
        default: config.code.lang,
        describe: 'Programming language of the source code',
        choices: config.sys.langs
      })
      .positional('contestname', {
        type: 'string',
        default: '',
        describe: 'Name of the contest'
      })
      .example(chalk.yellow('leetcode virtual weekly-contest-175'), 'Get Contest Detail')
      .example(chalk.yellow('leetcode virtual weekly-contest-175 --start'), 'Start Contest')
      .example(chalk.yellow('leetcode virtual weekly-contest-175 --question 0 -gxe'), 'Open Code and Problem 0 In Editor')
      .example(chalk.yellow('leetcode virtual weekly-contest-175 -f 1346.check-if-n-and-its-double-exist.cpp'), 'Test Code')
      .example(chalk.yellow('leetcode virtual weekly-contest-175 -f 1346.check-if-n-and-its-double-exist.cpp --submit'), 'Submit Problem 1346')
      .example(chalk.yellow('leetcode virtual weekly-contest-175 --myrank'), 'Get My Ranking')
      .example(chalk.yellow('leetcode virtual weekly-contest-175 --end'), 'End Virtual Contest');
  }
};

function printProblems(data) {
  for (let datai of data) {
    const problem = datai.problem;
    // REDUNDENT from list.js
    log.printf('%s %s %s [%=4s] %-60s %s %-6s (%s %%)',
      (problem.starred ? chalk.yellow(icon.like) : icon.empty),
      (problem.locked ? chalk.red(icon.lock) : icon.nolock),
      h.prettyState(problem.state),
      problem.fid,
      problem.name,
      datai.credit,
      h.prettyLevel(problem.level),
      (problem.percent || 0).toFixed(2));
  }
}

function printResult(actual, extra, k) {
  if (!actual.hasOwnProperty(k)) return;
  // HACk: leetcode still return 'Accepted' even the answer is wrong!!
  const v = actual[k] || '';
  if (k === 'state' && v === 'Accepted') return;

  let ok = actual.ok;

  const lines = Array.isArray(v) ? v : [v];
  for (let line of lines) {
    const extraInfo = extra ? ` (${extra})` : '';
    if (k !== 'state') line = lodash.startCase(k) + extraInfo + ': ' + line;
    log.info('  ' + h.prettyText(' ' + line, ok));
  }
}

function runTest(problem, argv) {
  if (!file.exist(argv.filename))
    return log.fatal('File ' + argv.filename + ' not exist!');

  const meta = file.meta(argv.filename);

  if (!problem.testable)
    return log.fail('not testable? please submit directly!');

  if (argv.testcase)
    problem.testcase = argv.testcase.replace(/\\n/g, '\n');

  if (!problem.testcase)
    return log.fail('missing testcase?');

  problem.file = argv.filename;
  problem.lang = meta.lang;
  problem.contest = argv.contestname;

  core.testVirtualProblem(problem, function (e, results) {
    if (e) return log.fail(e);

    results = _.sortBy(results, x => x.type);
    if (results[0].state === 'Accepted')
      results[0].state = 'Finished';
    printResult(results[0], null, 'state');
    printResult(results[0], null, 'error');

    results[0].your_input = problem.testcase;
    results[0].output = results[0].answer;
    // LeetCode-CN returns the actual and expected answer into two separate responses
    if (results[1]) {
      results[0].expected_answer = results[1].answer;
    }
    results[0].stdout = results[0].stdout.slice(1, -1).replace(/\\n/g, '\n');
    printResult(results[0], null, 'your_input');
    printResult(results[0], results[0].runtime, 'output');
    printResult(results[0], null, 'expected_answer');
    printResult(results[0], null, 'stdout');
  });
}

function printLine() {
  const args = Array.from(arguments);
  const actual = args.shift();
  const line = util.format.apply(util, args);
  log.info('  ' + h.prettyText(' ' + line, actual.ok));
}

function runSubmit(problem, argv) {
  if (!file.exist(argv.filename))
    return log.fatal('File ' + argv.filename + ' not exist!');

  const meta = file.meta(argv.filename);

  problem.file = argv.filename;
  problem.lang = meta.lang;
  problem.contest = session.argv.contestname;

  core.submitVirtualProblem(problem, function (e, results) {
    if (e) return log.fail(e);

    const result = results[0];

    printResult(result, 'state');
    printLine(result, '%d/%d cases passed (%s)',
      result.passed, result.total, result.runtime);

    if (result.ok) {
      session.updateStat('ac', 1);
      session.updateStat('ac.set', problem.fid);

      (function () {
        if (result.runtime_percentile)
          printLine(result, 'Your runtime beats %d %% of %s submissions',
            result.runtime_percentile.toFixed(2), result.lang);
        else
          return log.warn('Failed to get runtime percentile.');
        if (result.memory && result.memory_percentile)
          printLine(result, 'Your memory usage beats %d %% of %s submissions (%s)',
            result.memory_percentile.toFixed(2), result.lang, result.memory);
        else
          return log.warn('Failed to get memory percentile.');
      })();
    } else {
      result.testcase = result.testcase.slice(1, -1).replace(/\\n/g, '\n');
      printResult(result, 'error');
      printResult(result, 'testcase');
      printResult(result, 'answer');
      printResult(result, 'expected_answer');
      printResult(result, 'stdout');
    }

    // update this problem status in local cache
    core.updateProblem(problem, { state: (result.ok ? 'ac' : 'notac') });
  });
}

function getProblemList(questions) {
  var problems = [];
  for (let question of questions)
    problems.push({ "qid": question.question_id, "credit": question.credit, "title_slug": question.title_slug });
  return problems;
}

function handleArguments(e, problems) {
  if (e) throw new Error(e);

  const argv = session.argv

  if (argv.view || (!argv.start && !argv.end && argv.filename == '' && !argv.submit))
    return printProblems(problems);

  if (argv.question != -1)
    return core.showProblem(problems[argv.question]['problem'], argv);

  if (argv.filename != '') {
    const slug = file.name(argv.filename).split('.')[1];
    log.debug(slug);

    var problem;
    for (let i = 0; i < problems.length; i++)
      if (problems[i]['title_slug'] == slug) {
        problem = problems[i]['problem'];
        problem.contest = session.argv.contestname;
      }

    if (argv.submit)
      return runSubmit(problem, argv);
    else
      return runTest(problem, argv);
  }
}

function runVirtual(e, response) {
  if (e) return log.error(e);

  const vproblems = getProblemList(response.questions);

  async.mapSeries(vproblems, function (vprob, callback) {
    core.getProblem(vprob.title_slug, function (e, problem) {
      if (e) return log.fail(e);
      problem.question_id = vprob.qid;
      vprob.problem = problem;
      log.debug("Virtual: Got " + vprob.title_slug);
      callback(null, vprob);
    })
  }, handleArguments);
}

// ### HTTP web requests below
core.makeOpts = function (method, url, referer) {
  const opts = core.next.makeOpts(url);
  opts.method = method;
  opts.headers.Referer = referer;
  return opts;
}

function startContest(cb) {
  const opts = core.makeOpts('POST', config.sys.urls.vparticipate.replace('$contest', session.argv.contestname), config.sys.urls.vcontestpage.replace('$contest', session.argv.contestname));

  request(opts, function (error, response) {
    if (error) throw new Error(error);
    cb(response.statusCode);
  });
}

function endContest(cb) {
  const opts = core.makeOpts('DELETE', config.sys.urls.vparticipate.replace('$contest', session.argv.contestname), config.sys.urls.vcontestpage.replace('$contest', session.argv.contestname));

  request(opts, function (error, response) {
    if (error) throw new Error(error);
    cb(response.statusCode);
  });
}

// Not used this function yet :registerContest(argv.contestname, true/false);
function registerContest(contestSlug, flag) {
  const URL = 'https://leetcode.com/contest/api/$contest/register';
  const opts = core.makeOpts(flag ? 'POST' : 'DELETE', URL.replace('$contest', contestSlug), config.sys.urls.vcontestpage.replace('$contest', contestSlug));

  request(opts, function (error, resp) {
    if (error) throw new Error(error);

    if (flag && resp.statusCode == 302 && resp.headers.location == '/contest/' + contestSlug)
      log.info(chalk.yellow("Successfully registered for " + contestSlug));
    else if (!flag && resp.statusCode == 204)
      log.info(chalk.yellow("Successfully un-registered for " + contestSlug));
    else
      log.error('Unknown response ' + resp.statusCode + ' ' + resp.body);
  });
}

function showMyRank() {
  var opts = core.makeOpts('GET', config.sys.urls.vmyrank.replace('$contest', session.argv.contestname), config.sys.urls.vcontestpage.replace('$contest', session.argv.contestname));

  request(opts, function (error, response) {
    if (error) throw new Error(error);
    const object = JSON.parse(response.body);
    console.dir(object, { depth: null, colors: true });
  });
}

cmd.handler = function (argv) {
  session.argv = argv;

  if (argv.start || argv.end) {
    var cb = function (statusCode) {
      const output = "[Virtual Contest]: " + argv.contestname;
      if (statusCode == 204)
        log.info(chalk.yellow(output + " " + (argv.start ? "Started" : "Ended") + " Successfully"));
      else if (statusCode == 403)
        log.info(chalk.yellow(output + " Already " + (argv.start ? "Started" : "Ended")));
      else
        log.info(chalk.yellow("  Unknown Response " + statusCode));
    };

    if (argv.start)
      return startContest(cb)
    else
      return endContest(cb)
  }

  if (argv.myrank)
    return showMyRank()

  log.debug("Virtual: Fetching problems");
  core.getContest(argv.contestname, runVirtual);
};

module.exports = cmd;
