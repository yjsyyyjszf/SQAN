#!/usr/bin/node

# This script exits once it loada all orthanc images, so cron has to keep running it over and over
# It might be a good idea to let cron restart the script, but to be consistent with other script
# I think I should make it run continously

var request = require("request")
var async = require('async');
var fs = require('fs');
var amqp = require('amqp');

var config = require('../config/config.js').config;
//var mongoose = require('mongoose');

var orthanc_url = 'https://test:test@soichi7.ppa.iu.edu/orthanc';
var conn = amqp.createConnection(config.amqp);

function process(since, limit, ex) {
    console.log("downloading changed since seqid:"+since+" from url:"+orthanc_url+'/changes?since='+since+'&limit='+limit);
    request({ url: orthanc_url+'/changes?since='+since+'&limit='+limit, json: true }, handle_response);

    function handle_response(error, response, json) {
        if (!error && response.statusCode === 200) {
            if(json.Changes) {
                async.eachSeries(json.Changes, function(change, next) {
                    /*
                    { ChangeType: 'NewInstance',
                      Date: '20150420T172053',
                      ID: 'bb1b239d-a80d6649-44ea3fc5-b6527fc1-fe4ce7ed',
                      Path: '/instances/bb1b239d-a80d6649-44ea3fc5-b6527fc1-fe4ce7ed',
                      ResourceType: 'Instance',
                      Seq: 110 }
                    */
                    //console.dir(change);
                    if(change.ChangeType == 'NewInstance') {
                        process_instance(change, next, ex); 
                    } else {
                        next();
                    }
                }, function() {
                    var done = json.Done; //true / false
                    var last = json.Last; //Seq id of last change event receieved
                    if(done) {
                        fs.writeFile(config.orthanc_last_seq, last.toString(), function(err) {
                            if(err) throw err;
                            console.log("disconnecting amqp");
                            conn.disconnect();
                            //mongoose.disconnect();
                        });
                    } else {
                        process(last, limit, ex);
                    }
                });
            }
        } else {
            console.log('failed');
            console.dir(error);
            console.dir(response);
        }
    }
}

function process_instance(change, next, ex) {
    /*
    { ChangeType: 'NewInstance',
      Date: '20150420T172053',
      ID: 'bb1b239d-a80d6649-44ea3fc5-b6527fc1-fe4ce7ed',
      Path: '/instances/bb1b239d-a80d6649-44ea3fc5-b6527fc1-fe4ce7ed',
      ResourceType: 'Instance',
      Seq: 110 }
    */
    var tagurl = orthanc_url+change.Path+'/simplified-tags';
    console.log("loading (seq:"+change.Seq+"):"+tagurl);
    request({ url: tagurl, json: true }, function(err, res, json){
        if(err) {
            console.dir(err);
            next();
        } else {
            console.log(json.SOPInstanceUID); 
            ex.publish("orthanc", json); 
             
            //let's store copy to incoming_headers
            fs.writeFile(config.incoming_headers+"/"+json.SOPInstanceUID+".json", JSON.stringify(json,null,4), function(err) {
                if(err) return next(err);
                //remove the instance from orthanc
                request.del(orthanc_url+change.Path).on('response', function(res) {
                    //console.dir(res.statusCode);
                    //console.log("removed instance from orthanc.");
                    next();
                });
            });
        }
    });
}

conn.on('ready', function () {
    console.log("amqp ready");
    conn.exchange(config.incoming_ex, {autoDelete: false, durable: true, type: 'topic'}, function(ex) {
        //load starting point
        //I don't realyl need to do this anymore since I am removing data as I receive it
        fs.readFile(config.orthanc_last_seq, function(err, data) {
            console.log(Date.now());
            var lastseq = parseInt(data);
            process(lastseq, 50, ex); //process 50 records at a time
        });
    });
});

/*
mongoose.connect(config.mongodb, {}, function(err) {
    if(err) throw err;
    fs.readFile(lastseq_file, function(err, data) {
        console.log(Date.now());
        var lastseq = parseInt(data);
        process(lastseq, 50);
    });
});
*/

