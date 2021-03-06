app.controller('TemplateSummaryController',
function($scope, appconf, toaster, $http, $window, $location, serverconf) {

    $scope.$parent.active_menu = "tsummary";

    $scope.fields = ['IIBISID','Modality','StationName','radio_tracer','count'];
    $scope.fieldnames = ['IIBISID','Modality','Station Name','Radio Tracer','# Study Instances'];

    $scope.tseriesTable = ['Series Number','Series Description','Times used for QC','# Images'];

    $scope.sorting = {
        filter: '',
        fieldname: $scope.fieldnames[0]
    };

    $scope.opentemplate = function(tid) {
        console.log(tid);
        $window.open("template/"+tid);

    }

    $scope.templates = [];
    $scope.noTemplates = [];
    $scope.showNoTemplates = false;

    $scope.getTemplateSummary = function() {
        $http.get(appconf.api+'/templatesummary/istemplate').then(function(res) {
            $scope.templates = res.data;
            console.log($scope.templates.length + ' templates retrieved from exam db');
            console.log($scope.templates);
        }, function(err) {
            console.log("Error contacting API");
            console.dir(err);
        });
    };

    $scope.getNoTemplates = function() {
        $http.get(appconf.api+'/templatesummary/notemplate').then(function(res) {
            $scope.noTemplates = res.data;
            console.log(res.data.length + ' researches have no templates!');
        }, function(err) {
            console.log("Error contacting API");
            console.dir(err);
        });
    };

    $scope.export = function() {
        var data = [
            {"IIBISID":"IIBISID","Modality":"Modality","StationName":"StationName","radio_tracer":"radio_tracer","pi":"PI","email":"email"}];
        //console.log($scope.summary);

        $scope.noTemplates.forEach(function(nt) {
            let pi = nt.iibis ? nt.iibis.pi_last_name + ', ' + nt.iibis.pi_first_name : 'n/a';
            let email = nt.iibis ? nt.iibis.coordinator_email : 'n/a';
            let row = {
                IIBISID: nt.research.IIBISID,
                Modality: nt.research.Modality,
                StationName: nt.research.StationName,
                radio_tracer: nt.research.radio_tracer,
                pi: pi,
                email: email
            }
            data.push(row);
        })

        console.log(data);
        return data;
    };

    $scope.getTemplateSummary();
    $scope.getNoTemplates();

    $scope.rowNumber = -1;
    $scope.indexShowSeries=-1;
    $scope.fadedBackground = false;

    $scope.templatesByTimestamp = function(research,index){

        $scope.indexShowSeries=-1;

        if($scope.rowNumber!==index){

            $scope.fadedBackground = true;

            $scope.templatebytimestamp = [];
            $scope.templatesUsed = [];
            $scope.rowNumber=index;

            research.exam_id.forEach(function(eid,ind) {
                $http.get(appconf.api+'/templatesummary/texams/'+eid,{}).then(function(res) {
                    $scope.templatebytimestamp.push(res.data);
                    //if ($scope.templatebytimestamp.length == research.exam_id.length) {
                    //    $scope.rowNumber=index;
                    //}
                    console.log($scope.templatebytimestamp)
                })
            })
        } else {
            $scope.rowNumber=-1;
            $scope.fadedBackground = false;
        };
    }

    $scope.getTemplateSeries = function(timestamp,index){
        console.log('index  ' + index)
        console.log('indexShowSeries ' + $scope.indexShowSeries)

        $scope.series2delete = [];

        if($scope.indexShowSeries!==index){
            $scope.indexShowSeries=index;
            console.log(timestamp)
            $scope.templateSeries = timestamp;

        } else {
            $scope.indexShowSeries=-1;
            $scope.templateSeries = [];
        }
    }

    $scope.deleteThisSeries = function(templateSeries){
        console.log(templateSeries);
        var indx = $scope.series2delete.indexOf(templateSeries.template_id);
        if (indx == -1) $scope.series2delete.push(templateSeries.template_id);
        if (indx != -1) $scope.series2delete.splice(indx,1);
        console.log($scope.series2delete);
    }


    $scope.deleteSelectedSeries = function(timestamp,index) {

        var alert = `Please confirm that you want to delete ${$scope.series2delete.length} selected series in this Template`;
        var r = confirm(alert);
        if (r == true) {
            console.log(timestamp);
            console.log("initial timestamp length is "+timestamp.series.length)
            console.log($scope.series2delete);
            var s2d = 0;
            $scope.series2delete.forEach(function(ts){
                $http.get(appconf.api+'/templatesummary/deleteselected/'+ts,{}).then(function(res) {
                    console.log(res.data);
                    timestamp.series.forEach(function(ss,ind){
                        if(ss.template_id == ts){
                            timestamp.series.splice(ind,1);
                            console.log("timestamp length is "+timestamp.series.length)
                            s2d++
                            console.log(s2d)
                            if (s2d == $scope.series2delete.length) {
                                    console.log("Emtying series2delete")
                                    $scope.series2delete = [];
                            } else return;
                        }
                    })
                })
            });
        } else {
          console.log("Deletion canceled")
        }
    }


    $scope.deleteTemplate = function(timestamp,index) {
        var alert = `Please confirm that you want to Delete all the series in this Template`;
        var r = confirm(alert);
        if (r == true) {
            var texam_id = timestamp.exam_id;
            console.log("Deleting template exam "+texam_id);
            $http.get(appconf.api+'/templatesummary/deleteall/'+texam_id,{}).then(function(res) {
                console.log(res.data)
                $scope.templatebytimestamp.splice(index,1);
            })
        } else {
          console.log("Deletion canceled")
        }
    }

});
